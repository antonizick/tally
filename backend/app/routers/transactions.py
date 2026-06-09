from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func
from sqlalchemy.orm import selectinload
from app.database import get_db
from app.models import Transaction, TransactionTag, Tag, Category, CorrectionHistory
from app.schemas.transaction import TransactionRead, TransactionUpdate, TransactionFilter

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


async def _build_tx_read(tx: Transaction, db: AsyncSession) -> dict:
    cat_name = None
    if tx.category_id:
        cat = await db.get(Category, tx.category_id)
        cat_name = cat.name if cat else None
    tags = []
    for tt in tx.tags:
        tag = await db.get(Tag, tt.tag_id)
        if tag:
            tags.append({"id": tag.id, "name": tag.name, "type": tag.type, "color": tag.color})

    source_file = None
    try:
        if hasattr(tx, 'import_batch') and tx.import_batch:
            source_file = tx.import_batch.filename
    except Exception:
        source_file = None

    return {
        "id": tx.id,
        "account_id": tx.account_id,
        "date": str(tx.date),
        "description": tx.description,
        "original_description": tx.original_description,
        "amount": tx.amount,
        "balance": tx.balance,
        "category_id": tx.category_id,
        "category_name": cat_name,
        "status": tx.status,
        "review_status": tx.review_status,
        "confidence": tx.confidence,
        "ai_category_suggestion": tx.ai_category_suggestion,
        "is_transfer": tx.is_transfer,
        "tags": tags,
        "notes": tx.notes,
        "created_at": str(tx.created_at),
        "source_file": source_file,
    }


@router.get("/")
async def list_transactions(
    account_ids: str | None = Query(None),
    category_ids: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    review_status: str | None = Query(None),
    search: str | None = Query(None),
    amount_sign: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
):
    filters = []
    if account_ids:
        ids = [int(i) for i in account_ids.split(",") if i.strip()]
        if ids:
            filters.append(Transaction.account_id.in_(ids))
    if category_ids:
        ids = [int(i) for i in category_ids.split(",") if i.strip()]
        if ids:
            filters.append(Transaction.category_id.in_(ids))
    if date_from:
        filters.append(Transaction.date >= date_from)
    if date_to:
        filters.append(Transaction.date <= date_to)
    if review_status:
        filters.append(Transaction.review_status == review_status)
    if search:
        filters.append(Transaction.description.ilike(f"%{search}%"))
    if amount_sign == "positive":
        filters.append(Transaction.amount > 0)
    elif amount_sign == "negative":
        filters.append(Transaction.amount < 0)

    offset = (page - 1) * page_size

    count_q = select(func.count(Transaction.id))
    if filters:
        count_q = count_q.where(and_(*filters))
    total = (await db.execute(count_q)).scalar_one()

    q = (
        select(Transaction)
        .options(selectinload(Transaction.tags), selectinload(Transaction.import_batch))
        .order_by(Transaction.date.desc(), Transaction.id.desc())
        .offset(offset)
        .limit(page_size)
    )
    if filters:
        q = q.where(and_(*filters))

    result = await db.execute(q)
    txs = result.scalars().all()

    items = [await _build_tx_read(tx, db) for tx in txs]
    return {"total": total, "page": page, "page_size": page_size, "items": items}


@router.get("/review-queue")
async def review_queue(db: AsyncSession = Depends(get_db)):
    """All transactions pending AI review."""
    q = (
        select(Transaction)
        .options(selectinload(Transaction.tags))
        .where(Transaction.review_status == "pending")
        .order_by(Transaction.confidence.asc(), Transaction.date.desc())
        .limit(100)
    )
    result = await db.execute(q)
    txs = result.scalars().all()
    items = [await _build_tx_read(tx, db) for tx in txs]
    pending_count = (
        await db.execute(
            select(func.count(Transaction.id)).where(
                Transaction.review_status == "pending",
                Transaction.date >= "2026-05-01",
            )
        )
    ).scalar_one()
    return {"pending_count": pending_count, "items": items}


@router.patch("/{tx_id}")
async def update_transaction(tx_id: int, body: TransactionUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Transaction)
        .options(selectinload(Transaction.tags))
        .where(Transaction.id == tx_id)
    )
    tx = result.scalar_one_or_none()
    if not tx:
        raise HTTPException(404, "Transaction not found")

    old_cat_id = tx.category_id
    old_cat_name = tx.ai_category_suggestion

    if body.category_id is not None:
        tx.category_id = body.category_id
        tx.review_status = "overridden"
        # Record correction for RAG
        if old_cat_id != body.category_id:
            new_cat = await db.get(Category, body.category_id)
            old_cat = await db.get(Category, old_cat_id) if old_cat_id else None
            correction = CorrectionHistory(
                transaction_id=tx_id,
                description=tx.description,
                original_category_id=old_cat_id,
                user_category_id=body.category_id,
                original_category_name=old_cat.name if old_cat else old_cat_name,
                user_category_name=new_cat.name if new_cat else None,
            )
            db.add(correction)

    if body.description is not None:
        tx.description = body.description
    if body.review_status is not None:
        tx.review_status = body.review_status
    if body.is_transfer is not None:
        tx.is_transfer = body.is_transfer
    if body.notes is not None:
        tx.notes = body.notes
    if body.tag_ids is not None:
        # Replace all tags
        await db.execute(
            TransactionTag.__table__.delete().where(TransactionTag.transaction_id == tx_id)
        )
        for tag_id in body.tag_ids:
            db.add(TransactionTag(transaction_id=tx_id, tag_id=tag_id))

    await db.commit()
    await db.refresh(tx)
    return await _build_tx_read(tx, db)


@router.post("/bulk-approve")
async def bulk_approve(ids: list[int], db: AsyncSession = Depends(get_db)):
    """Approve multiple transactions at once."""
    result = await db.execute(
        select(Transaction).where(Transaction.id.in_(ids))
    )
    txs = result.scalars().all()
    for tx in txs:
        tx.review_status = "approved"
    await db.commit()
    return {"approved": len(txs)}


@router.get("/summary")
async def transaction_summary(
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    account_ids: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    filters = [Transaction.is_transfer == False]
    if date_from:
        filters.append(Transaction.date >= date_from)
    if date_to:
        filters.append(Transaction.date <= date_to)
    if account_ids:
        ids = [int(i) for i in account_ids.split(",") if i.strip()]
        if ids:
            filters.append(Transaction.account_id.in_(ids))

    result = await db.execute(
        select(
            func.sum(Transaction.amount).filter(Transaction.amount < 0).label("expenses"),
            func.sum(Transaction.amount).filter(Transaction.amount > 0).label("income"),
            func.count(Transaction.id).label("count"),
        ).where(and_(*filters))
    )
    row = result.one()
    return {
        "expenses": float(row.expenses or 0),
        "income": float(row.income or 0),
        "net": float((row.income or 0) + (row.expenses or 0)),
        "count": row.count,
    }
