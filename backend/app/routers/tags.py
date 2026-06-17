from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.database import get_db
from app.models import Tag, TransactionTag, Transaction
from pydantic import BaseModel

router = APIRouter(prefix="/api/tags", tags=["tags"])


class TagCreate(BaseModel):
    name: str
    type: str = "custom"
    color: str | None = None


class TagRead(BaseModel):
    id: int
    name: str
    type: str
    color: str | None
    pinned: bool = False
    model_config = {"from_attributes": True}


@router.get("/relevant", response_model=list[TagRead])
async def relevant_tags(
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Pinned tags + tags used in the given date range, ordered pinned-first then alpha."""
    pinned_rows = (await db.execute(select(Tag).where(Tag.pinned == True).order_by(Tag.name))).scalars().all()
    pinned_ids = {t.id for t in pinned_rows}

    period_tags: list[Tag] = []
    if date_from or date_to:
        tx_filters = []
        if date_from:
            tx_filters.append(Transaction.date >= date_from)
        if date_to:
            tx_filters.append(Transaction.date <= date_to)
        used_ids = (
            await db.execute(
                select(TransactionTag.tag_id)
                .join(Transaction, Transaction.id == TransactionTag.transaction_id)
                .where(and_(*tx_filters))
                .distinct()
            )
        ).scalars().all()
        non_pinned_used = [i for i in used_ids if i not in pinned_ids]
        if non_pinned_used:
            period_tags = (
                await db.execute(
                    select(Tag).where(Tag.id.in_(non_pinned_used)).order_by(Tag.name)
                )
            ).scalars().all()

    return list(pinned_rows) + list(period_tags)


@router.get("/", response_model=list[TagRead])
async def list_tags(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Tag).order_by(Tag.pinned.desc(), Tag.name))
    return result.scalars().all()


@router.post("/", response_model=TagRead)
async def create_tag(body: TagCreate, db: AsyncSession = Depends(get_db)):
    existing = (await db.execute(select(Tag).where(Tag.name == body.name))).scalar_one_or_none()
    if existing:
        return existing
    tag = Tag(**body.model_dump())
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return tag


@router.post("/seed")
async def seed_tags(db: AsyncSession = Depends(get_db)):
    """Seed default pinned tags."""
    existing = (await db.execute(select(Tag))).scalars().all()
    if existing:
        return {"message": "Tags already exist"}
    defaults = [
        Tag(name="Nick", type="person", color="#3b82f6", pinned=True),
        Tag(name="Emma", type="person", color="#ec4899", pinned=True),
        Tag(name="Family", type="project", color="#22c55e", pinned=True),
        Tag(name="Work", type="project", color="#f59e0b", pinned=True),
        Tag(name="Cat Stuff", type="custom", color="#8b5cf6", pinned=True),
        Tag(name="Subscriptions", type="custom", color="#06b6d4", pinned=True),
    ]
    for t in defaults:
        db.add(t)
    await db.commit()
    return {"message": "Tags seeded", "count": len(defaults)}


@router.delete("/{tag_id}")
async def delete_tag(tag_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Tag).where(Tag.id == tag_id))
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(404, "Tag not found")
    await db.delete(tag)
    await db.commit()
    return {"ok": True}
