"""Rule-based transaction categorization from historical description -> category matches.

Runs before AI categorization: for each transaction, normalize its description and look
up how the user has categorized similar transactions in the past. Only auto-assigns when
history is consistent (>= MIN_CONFIDENCE across >= MIN_SAMPLES prior transactions);
anything ambiguous, inconsistent, or unseen falls through to AI categorization.
"""
import re
from collections import Counter, defaultdict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Transaction

MIN_SAMPLES = 3
MIN_CONFIDENCE = 0.8

# Statement boilerplate seen across common bank/credit-union CSV exports. Stripped
# before matching so "Withdrawal Debit Card/STARBUCKS ... Trace Number: 123" and
# "STARBUCKS #4821" collapse to the same merchant key.
_PREFIX_STRIP = (
    "withdrawal debit card/", "withdrawal ach ", "deposit ach ",
    "deposit by check/", "withdrawal home banking transfer",
    "withdrawal/", "deposit/", "pos debit ", "purchase authorized on ",
)
_TRUNCATE_MARKERS = (
    "trace number", "previous balance", "new balance",
    "merchant category code", "/type:", " date ", "entry class code",
)
_PHONE_RE = re.compile(r"\b\d{3}[-.]?\d{3,4}[-.]?\d{4}\b")
_DATE_RE = re.compile(r"\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b")
_NON_ALNUM_RE = re.compile(r"[^a-z0-9 ]+")


def normalize_description(desc: str) -> str:
    """Collapse a raw statement description down to a stable merchant key."""
    s = (desc or "").lower().strip()
    for prefix in _PREFIX_STRIP:
        if s.startswith(prefix):
            s = s[len(prefix):]
            break
    cut = len(s)
    for marker in _TRUNCATE_MARKERS:
        idx = s.find(marker)
        if idx != -1:
            cut = min(cut, idx)
    s = s[:cut]
    s = _PHONE_RE.sub(" ", s)
    s = _DATE_RE.sub(" ", s)
    s = _NON_ALNUM_RE.sub(" ", s)
    # drop transaction IDs / reference numbers: tokens of len>=4 that contain a digit
    tokens = [t for t in s.split() if not (len(t) >= 4 and any(c.isdigit() for c in t))]
    return " ".join(tokens[:6])


def is_exempt(description: str, exemptions: list[str]) -> bool:
    """True if any exemption substring (case-insensitive) appears in the description."""
    if not exemptions:
        return False
    lower = (description or "").lower()
    return any(ex.lower() in lower for ex in exemptions if ex.strip())


class HistoryIndex:
    """normalized description -> Counter[category_id] built from confirmed past transactions."""

    def __init__(self, counts: dict[str, Counter]):
        self._counts = counts

    def match(self, description: str) -> tuple[int, float] | None:
        key = normalize_description(description)
        if not key:
            return None
        counter = self._counts.get(key)
        if not counter:
            return None
        total = sum(counter.values())
        if total < MIN_SAMPLES:
            return None
        category_id, count = counter.most_common(1)[0]
        confidence = count / total
        if confidence < MIN_CONFIDENCE:
            return None
        return category_id, confidence


async def build_history_index(db: AsyncSession) -> HistoryIndex:
    """Index past transactions the user has confirmed (approved or manually overridden)."""
    result = await db.execute(
        select(Transaction.description, Transaction.category_id)
        .where(Transaction.category_id.isnot(None))
        .where(Transaction.review_status != "pending")
    )
    counts: dict[str, Counter] = defaultdict(Counter)
    for description, category_id in result.all():
        key = normalize_description(description)
        if key:
            counts[key][category_id] += 1
    return HistoryIndex(counts)
