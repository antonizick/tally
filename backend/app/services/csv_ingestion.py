"""CSV ingestion pipeline: parse → deduplicate → queue for AI categorization."""
import csv
import hashlib
import io
import chardet
from datetime import date as date_type
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.models import (
    Account, SchemaMapping, Transaction, ImportBatch, Category, CorrectionHistory
)
from app.services.schema_mapper import (
    fingerprint_headers, detect_schema, parse_amount, parse_date
)
from app.ai.categorize import categorize_batch


def detect_encoding(data: bytes) -> str:
    result = chardet.detect(data)
    return result.get("encoding") or "utf-8"


def parse_csv_bytes(data: bytes) -> tuple[list[str], list[dict]]:
    encoding = detect_encoding(data)
    text = data.decode(encoding, errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    headers = reader.fieldnames or []
    rows = list(reader)
    return [h.strip() for h in headers], rows


def make_dedup_hash(account_id: int, date, description: str, amount: float) -> str:
    key = f"{account_id}|{date}|{description[:100]}|{amount:.2f}"
    return hashlib.sha256(key.encode()).hexdigest()[:32]


async def get_or_create_account(
    db: AsyncSession,
    account_name: str,
    account_type: str = "checking",
    masked_number: str | None = None,
) -> Account:
    result = await db.execute(select(Account).where(Account.name == account_name))
    account = result.scalar_one_or_none()
    if not account:
        account = Account(
            name=account_name,
            type=account_type,
            account_number_masked=masked_number,
        )
        db.add(account)
        await db.flush()
    return account


async def get_schema_mapping(
    db: AsyncSession, account_id: int, fingerprint: str
) -> SchemaMapping | None:
    result = await db.execute(
        select(SchemaMapping).where(
            and_(
                SchemaMapping.account_id == account_id,
                SchemaMapping.header_fingerprint == fingerprint,
                SchemaMapping.is_confirmed == True,
            )
        )
    )
    return result.scalar_one_or_none()


async def get_categories(db: AsyncSession) -> dict[str, int]:
    """Return {full_path: id} for all categories."""
    result = await db.execute(select(Category))
    cats = result.scalars().all()
    # Build parent lookup
    by_id = {c.id: c for c in cats}
    cat_map: dict[str, int] = {}
    for c in cats:
        parts = [c.name]
        parent = by_id.get(c.parent_id)
        while parent:
            parts.insert(0, parent.name)
            parent = by_id.get(parent.parent_id)
        cat_map[" > ".join(parts)] = c.id
    return cat_map


async def get_recent_corrections(db: AsyncSession) -> list[dict]:
    result = await db.execute(
        select(CorrectionHistory)
        .order_by(CorrectionHistory.created_at.desc())
        .limit(50)
    )
    corrections = result.scalars().all()
    return [
        {"description": c.description, "category": c.user_category_name or "Uncategorized"}
        for c in corrections
    ]


async def ingest_csv(
    db: AsyncSession,
    file_data: bytes,
    filename: str,
    account_id: int,
    mapping_override: dict | None = None,
) -> dict:
    """
    Full ingestion pipeline. Returns:
    {
        batch_id, status, total, imported, duplicates,
        needs_mapping_confirmation: bool,
        proposed_mapping: dict | None,
        fingerprint: str,
    }
    """
    headers, rows = parse_csv_bytes(file_data)
    if not headers or not rows:
        raise ValueError("CSV is empty or unreadable")

    fingerprint = fingerprint_headers(headers)
    sample_rows = [[str(r.get(h, "")) for h in headers] for r in rows[:5]]

    # Check for existing confirmed mapping
    saved_mapping = await get_schema_mapping(db, account_id, fingerprint)

    if mapping_override:
        mapping = mapping_override
        needs_confirmation = False
    elif saved_mapping:
        mapping = saved_mapping.column_mapping
        needs_confirmation = False
    else:
        mapping, confidence = await detect_schema(headers, sample_rows)
        needs_confirmation = confidence < 0.95
        if needs_confirmation:
            return {
                "batch_id": None,
                "status": "needs_mapping",
                "needs_mapping_confirmation": True,
                "proposed_mapping": mapping,
                "fingerprint": fingerprint,
                "headers": headers,
                "sample_rows": sample_rows,
                "total": len(rows),
                "imported": 0,
                "duplicates": 0,
            }

    # Save confirmed mapping if new
    if not saved_mapping and mapping_override:
        sm = SchemaMapping(
            account_id=account_id,
            header_fingerprint=fingerprint,
            raw_headers=",".join(headers),
            column_mapping=mapping,
            date_format=mapping.get("date_format"),
            amount_type=mapping.get("amount_type", "single"),
            is_confirmed=True,
        )
        db.add(sm)

    # Create import batch
    batch = ImportBatch(
        account_id=account_id,
        filename=filename,
        status="processing",
        total_rows=len(rows),
    )
    db.add(batch)
    await db.flush()

    # Parse rows
    parsed: list[dict] = []
    for row in rows:
        date = parse_date(row, mapping)
        amount = parse_amount(row, mapping)
        desc_col = mapping.get("description")
        orig_desc_col = mapping.get("original_description") or mapping.get("description")
        desc = str(row.get(desc_col, "") or "").strip()[:500] if desc_col else ""
        orig_desc = str(row.get(orig_desc_col, "") or "").strip()[:500] if orig_desc_col else desc
        balance_col = mapping.get("balance")
        balance_raw = row.get(balance_col, "") if balance_col else None
        try:
            balance = float(str(balance_raw or "").replace(",", "").replace("$", "")) if balance_raw and str(balance_raw).strip() else None
        except ValueError:
            balance = None
        status_col = mapping.get("status")
        status = str(row.get(status_col, "posted") or "posted").lower().strip() if status_col else "posted"
        if status not in ("pending", "posted"):
            status = "posted"

        if not date or not desc:
            continue

        parsed.append({
            "date": date,
            "description": desc,
            "original_description": orig_desc,
            "amount": amount,
            "balance": balance,
            "status": status,
            "raw": {k: str(v) for k, v in row.items()},
        })

    # Get categories and corrections for AI
    cat_map = await get_categories(db)
    cat_list = list(cat_map.keys())
    corrections = await get_recent_corrections(db)

    # AI categorization in batches of 25
    ai_results: list[dict] = []
    batch_size = 25
    for i in range(0, len(parsed), batch_size):
        chunk = parsed[i:i + batch_size]
        if cat_list:
            results = await categorize_batch(
                [{"description": p["description"]} for p in chunk],
                cat_list,
                corrections,
            )
        else:
            results = [{"category": "Uncategorized", "confidence": 0.0, "is_transfer": False}] * len(chunk)
        ai_results.extend(results)

    # Insert transactions, skip duplicates
    imported = 0
    duplicates = 0
    for p, ai in zip(parsed, ai_results):
        dedup = make_dedup_hash(account_id, p["date"], p["description"], p["amount"])
        existing = await db.execute(
            select(Transaction).where(Transaction.dedup_hash == dedup)
        )
        if existing.scalar_one_or_none():
            duplicates += 1
            continue

        ai_category = ai.get("category", "Uncategorized")
        confidence = float(ai.get("confidence", 0.0))
        category_id = cat_map.get(ai_category)

        review_status = "pending" if confidence < 0.85 else "approved"

        tx = Transaction(
            account_id=account_id,
            import_batch_id=batch.id,
            date=p["date"],
            description=p["description"],
            original_description=p["original_description"],
            amount=p["amount"],
            balance=p["balance"],
            status=p["status"],
            category_id=category_id,
            review_status=review_status,
            confidence=confidence,
            ai_category_suggestion=ai_category,
            is_transfer=bool(ai.get("is_transfer", False)),
            dedup_hash=dedup,
            raw_source=p["raw"],
        )
        db.add(tx)
        imported += 1

    batch.status = "complete"
    batch.imported_rows = imported
    batch.duplicate_rows = duplicates

    await db.commit()

    return {
        "batch_id": batch.id,
        "status": "complete",
        "needs_mapping_confirmation": False,
        "proposed_mapping": None,
        "fingerprint": fingerprint,
        "total": len(rows),
        "imported": imported,
        "duplicates": duplicates,
    }
