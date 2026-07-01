"""Deterministic CSV schema detection with Ollama fallback."""
import hashlib
import re
from datetime import datetime
from dateutil import parser as dateutil_parser
from app.ai.categorize import infer_schema_mapping


# Column name patterns for deterministic matching
DATE_PATTERNS = re.compile(r"(date|time|posted|post\s*date|transaction\s*date)", re.I)
DESC_PATTERNS = re.compile(r"(description|desc|memo|merchant|name|payee|narrative)", re.I)
AMOUNT_PATTERNS = re.compile(r"^(amount|transaction\s*amount|amt)$", re.I)
DEBIT_PATTERNS = re.compile(r"(debit|withdrawal|charge|spent)", re.I)
CREDIT_PATTERNS = re.compile(r"(credit|deposit|payment\s*received)", re.I)
BALANCE_PATTERNS = re.compile(r"(balance|running\s*balance)", re.I)
CATEGORY_PATTERNS = re.compile(r"(category|type|merchant\s*type)", re.I)
STATUS_PATTERNS = re.compile(r"(status|state)", re.I)
REFERENCE_PATTERNS = re.compile(r"(reference|ref|check|confirmation)", re.I)


def fingerprint_headers(headers: list[str]) -> str:
    canonical = "|".join(sorted(h.strip().lower() for h in headers))
    return hashlib.sha256(canonical.encode()).hexdigest()[:32]


def detect_date_format(sample_values: list[str]) -> str | None:
    """Try to detect the date format from sample values."""
    formats_to_try = [
        "%m/%d/%Y", "%Y-%m-%d", "%m/%d/%y", "%d/%m/%Y",
        "%b %d, %Y", "%B %d, %Y", "%m-%d-%Y", "%Y/%m/%d",
    ]
    for val in sample_values:
        val = val.strip()
        if not val:
            continue
        for fmt in formats_to_try:
            try:
                datetime.strptime(val, fmt)
                return fmt
            except ValueError:
                continue
        # Try dateutil as fallback
        try:
            dateutil_parser.parse(val)
            return "auto"
        except Exception:
            continue
    return None


def heuristic_mapping(headers: list[str], sample_rows: list[list[str]]) -> dict:
    """Deterministic column mapping from headers."""
    mapping: dict[str, str | None] = {
        "date": None,
        "description": None,
        "amount": None,
        "debit": None,
        "credit": None,
        "balance": None,
        "category": None,
        "status": None,
        "reference": None,
    }

    for h in headers:
        h_clean = h.strip()
        if DATE_PATTERNS.search(h_clean):
            mapping["date"] = h_clean
        elif BALANCE_PATTERNS.search(h_clean):
            mapping["balance"] = h_clean
        elif DEBIT_PATTERNS.search(h_clean):
            mapping["debit"] = h_clean
        elif CREDIT_PATTERNS.search(h_clean):
            mapping["credit"] = h_clean
        elif AMOUNT_PATTERNS.search(h_clean):
            mapping["amount"] = h_clean
        elif DESC_PATTERNS.search(h_clean) and not mapping["description"]:
            mapping["description"] = h_clean
        elif CATEGORY_PATTERNS.search(h_clean):
            mapping["category"] = h_clean
        elif STATUS_PATTERNS.search(h_clean):
            mapping["status"] = h_clean
        elif REFERENCE_PATTERNS.search(h_clean):
            mapping["reference"] = h_clean

    # Detect amount type
    if mapping["debit"] and mapping["credit"]:
        mapping["amount_type"] = "split"
    elif mapping["amount"]:
        mapping["amount_type"] = "single"
    else:
        mapping["amount_type"] = "unknown"

    # Detect date format from first non-empty date column samples
    if mapping["date"]:
        date_col_idx = next(
            (i for i, h in enumerate(headers) if h.strip() == mapping["date"]), None
        )
        if date_col_idx is not None:
            date_samples = [
                row[date_col_idx] for row in sample_rows
                if date_col_idx < len(row) and row[date_col_idx].strip()
            ]
            mapping["date_format"] = detect_date_format(date_samples[:10])
    else:
        mapping["date_format"] = None

    return mapping


def confidence_score(mapping: dict) -> float:
    """How confident are we in this mapping? 0-1."""
    score = 0.0
    if mapping.get("date"):
        score += 0.3
    if mapping.get("description"):
        score += 0.2
    if mapping.get("amount") or (mapping.get("debit") and mapping.get("credit")):
        score += 0.3
    if mapping.get("date_format"):
        score += 0.2
    return score


async def detect_schema(
    headers: list[str],
    sample_rows: list[list[str]],
) -> tuple[dict, float]:
    """Returns (mapping, confidence). Calls Ollama if confidence < 0.8."""
    mapping = heuristic_mapping(headers, sample_rows)
    conf = confidence_score(mapping)

    if conf < 0.8:
        ai_mapping = await infer_schema_mapping(headers, sample_rows)
        # Merge AI results for any missing fields
        for field in ["date", "description", "amount", "debit", "credit", "balance",
                       "category", "status", "date_format", "amount_type"]:
            if not mapping.get(field) and ai_mapping.get(field):
                mapping[field] = ai_mapping[field]
        conf = max(conf, confidence_score(mapping))

    return mapping, conf


def _looks_numeric(samples: list[str]) -> bool:
    """Return True if most non-empty sample values parse as floats."""
    hits = 0
    checks = 0
    for v in samples:
        v = v.strip().replace("$", "").replace(",", "").replace("(", "-").replace(")", "")
        if not v:
            continue
        checks += 1
        try:
            float(v)
            hits += 1
        except ValueError:
            pass
    return checks == 0 or (hits / checks) >= 0.5


def validate_amount_mapping(mapping: dict, headers: list[str], sample_rows: list[list[str]]) -> bool:
    """Return False if the mapped amount column contains non-numeric data."""
    amount_type = mapping.get("amount_type", "single")
    col_names = []
    if amount_type == "split":
        col_names = [c for c in [mapping.get("debit"), mapping.get("credit")] if c]
    elif amount_type == "single":
        col_names = [mapping.get("amount")] if mapping.get("amount") else []

    for col in col_names:
        try:
            idx = next(i for i, h in enumerate(headers) if h.strip() == col)
        except StopIteration:
            continue
        samples = [row[idx] for row in sample_rows if idx < len(row)]
        if not _looks_numeric(samples):
            return False
    return True


def parse_amount(row: dict, mapping: dict) -> float:
    """Parse the dollar amount from a row, normalizing to signed float."""
    def clean(v: str) -> float:
        v = v.strip().replace("$", "").replace(",", "").replace("(", "-").replace(")", "")
        try:
            return float(v) if v else 0.0
        except ValueError:
            return 0.0

    amount_type = mapping.get("amount_type", "single")

    if amount_type == "split":
        debit_col = mapping.get("debit")
        credit_col = mapping.get("credit")
        debit = clean(row.get(debit_col, "") or "") if debit_col else 0.0
        credit = clean(row.get(credit_col, "") or "") if credit_col else 0.0
        # Debit = expense (negative), Credit = income (positive)
        return credit - debit

    elif amount_type == "single":
        amount_col = mapping.get("amount")
        raw = row.get(amount_col, "") or "" if amount_col else ""
        return clean(raw)

    return 0.0


def parse_date(row: dict, mapping: dict):
    """Returns a date object, or None."""
    date_col = mapping.get("date")
    if not date_col:
        return None
    raw = row.get(date_col, "").strip()
    if not raw:
        return None
    fmt = mapping.get("date_format")
    if fmt and fmt != "auto":
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            pass
    try:
        return dateutil_parser.parse(raw).date()
    except Exception:
        return None
