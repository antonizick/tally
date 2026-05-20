"""AI categorization using Ollama with RAG over correction history."""
from app.ai.ollama_client import ollama


SYSTEM_PROMPT = """You are a financial transaction categorizer. Given a transaction description,
assign it to the most appropriate category and sub-category from the provided list.

Return ONLY a JSON object with:
- "category": the full hierarchical category path (e.g. "Food > Groceries")
- "confidence": 0.0-1.0 (how confident you are)
- "reasoning": one short phrase explaining the choice
- "is_transfer": true if this looks like a transfer between accounts (credit card payment, bank transfer, etc.)
"""


async def categorize_transaction(
    description: str,
    categories: list[str],
    corrections: list[dict] | None = None,
) -> dict:
    """Categorize a single transaction. Returns {category, confidence, reasoning, is_transfer}."""
    examples = ""
    if corrections:
        example_lines = []
        for c in corrections[-20:]:  # last 20 corrections as few-shot examples
            example_lines.append(
                f'  - "{c["description"]}" → "{c["category"]}"'
            )
        examples = "\n\nPast user corrections (use as reference):\n" + "\n".join(example_lines)

    categories_str = "\n".join(f"  - {c}" for c in categories)

    user_msg = f"""Transaction: "{description}"

Available categories:
{categories_str}
{examples}

Categorize this transaction."""

    try:
        result = await ollama.chat_json(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ]
        )
        return {
            "category": result.get("category", "Uncategorized"),
            "confidence": float(result.get("confidence", 0.5)),
            "reasoning": result.get("reasoning", ""),
            "is_transfer": bool(result.get("is_transfer", False)),
        }
    except Exception as e:
        return {
            "category": "Uncategorized",
            "confidence": 0.0,
            "reasoning": f"AI unavailable: {e}",
            "is_transfer": False,
        }


async def categorize_batch(
    transactions: list[dict],
    categories: list[str],
    corrections: list[dict] | None = None,
) -> list[dict]:
    """Batch categorize. Returns list of results in same order."""
    # Build a batch prompt for efficiency
    tx_list = "\n".join(
        f'{i+1}. "{t["description"]}"' for i, t in enumerate(transactions)
    )
    categories_str = "\n".join(f"  - {c}" for c in categories)
    examples = ""
    if corrections:
        example_lines = [
            f'  - "{c["description"]}" → "{c["category"]}"'
            for c in corrections[-15:]
        ]
        examples = "\n\nPast user corrections:\n" + "\n".join(example_lines)

    system = """You are a financial transaction categorizer. Categorize each numbered transaction.
Return ONLY a JSON array where each element has:
- "category": hierarchical path e.g. "Food > Groceries"
- "confidence": 0.0-1.0
- "is_transfer": true if it's a transfer/payment between accounts
"""
    user_msg = f"""Transactions to categorize:
{tx_list}

Available categories:
{categories_str}
{examples}

Return a JSON array with one object per transaction, in order."""

    try:
        result = await ollama.chat_json(
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_msg},
            ]
        )
        if isinstance(result, list):
            return result
        # Some models wrap in {"results": [...]}
        if isinstance(result, dict) and "results" in result:
            return result["results"]
        return [{"category": "Uncategorized", "confidence": 0.0, "is_transfer": False}] * len(transactions)
    except Exception:
        return [{"category": "Uncategorized", "confidence": 0.0, "is_transfer": False}] * len(transactions)


async def infer_schema_mapping(headers: list[str], sample_rows: list[list[str]]) -> dict:
    """Use Ollama to infer CSV column mappings when heuristics aren't confident."""
    sample_str = "\n".join(
        ", ".join(str(v) for v in row) for row in sample_rows[:5]
    )
    system = """You are a CSV schema detector for bank/credit card statements.
Given column headers and sample data, identify which column maps to which financial field.

Return ONLY a JSON object with these keys (use null if not present):
- "date": column name for transaction date
- "description": column name for merchant/description
- "amount": column name if single amount column (positive=credit, negative=debit for some)
- "debit": column name for debit/withdrawal amount
- "credit": column name for credit/deposit amount
- "balance": column name for running balance
- "category": column name for pre-assigned category (if any)
- "status": column name for posted/pending status
- "date_format": detected date format (e.g. "%m/%d/%Y", "%Y-%m-%d")
- "amount_type": "single" if one amount col, "split" if separate debit/credit cols
"""
    user_msg = f"""Headers: {headers}

Sample rows:
{sample_str}

Map these columns."""

    try:
        return await ollama.chat_json(
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_msg},
            ]
        )
    except Exception:
        return {}
