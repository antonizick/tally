from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models import Tag
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
    model_config = {"from_attributes": True}


@router.get("/", response_model=list[TagRead])
async def list_tags(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Tag).order_by(Tag.name))
    return result.scalars().all()


@router.post("/", response_model=TagRead)
async def create_tag(body: TagCreate, db: AsyncSession = Depends(get_db)):
    tag = Tag(**body.model_dump())
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return tag


@router.post("/seed")
async def seed_tags(db: AsyncSession = Depends(get_db)):
    """Seed person tags for the family."""
    existing = (await db.execute(select(Tag))).scalars().all()
    if existing:
        return {"message": "Tags already exist"}
    defaults = [
        Tag(name="Nick", type="person", color="#3b82f6"),
        Tag(name="Emma", type="person", color="#ec4899"),
        Tag(name="Family", type="project", color="#22c55e"),
        Tag(name="Work", type="project", color="#f59e0b"),
        Tag(name="Cat Stuff", type="custom", color="#8b5cf6"),
        Tag(name="Subscriptions", type="custom", color="#06b6d4"),
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
