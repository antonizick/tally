from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from datetime import datetime, timezone

from app.database import get_db
from app.models.checklist import ChecklistStatus, ChecklistTemplate, ChecklistEntry
from app.schemas.checklist import (
    ChecklistStatusCreate, ChecklistStatusRead,
    ChecklistTemplateCreate, ChecklistTemplateRead,
    ChecklistEntryCreate, ChecklistEntryUpdate, ChecklistEntryRead,
)

router = APIRouter(prefix="/api/checklist", tags=["checklist"])


# ─── Statuses ────────────────────────────────────────────────────────────────

@router.get("/statuses", response_model=list[ChecklistStatusRead])
async def list_statuses(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ChecklistStatus).order_by(ChecklistStatus.sort_order, ChecklistStatus.name)
    )
    return result.scalars().all()


@router.post("/statuses", response_model=ChecklistStatusRead)
async def create_status(body: ChecklistStatusCreate, db: AsyncSession = Depends(get_db)):
    obj = ChecklistStatus(**body.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.put("/statuses/{status_id}", response_model=ChecklistStatusRead)
async def update_status(status_id: int, body: ChecklistStatusCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChecklistStatus).where(ChecklistStatus.id == status_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(404, "Status not found")
    for k, v in body.model_dump().items():
        setattr(obj, k, v)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/statuses/{status_id}")
async def delete_status(status_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChecklistStatus).where(ChecklistStatus.id == status_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(404, "Status not found")
    await db.delete(obj)
    await db.commit()
    return {"ok": True}


# ─── Templates ───────────────────────────────────────────────────────────────

@router.get("/templates", response_model=list[ChecklistTemplateRead])
async def list_templates(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ChecklistTemplate).order_by(ChecklistTemplate.sort_order, ChecklistTemplate.label)
    )
    return result.scalars().all()


@router.post("/templates", response_model=ChecklistTemplateRead)
async def create_template(body: ChecklistTemplateCreate, db: AsyncSession = Depends(get_db)):
    obj = ChecklistTemplate(**body.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.put("/templates/{template_id}", response_model=ChecklistTemplateRead)
async def update_template(template_id: int, body: ChecklistTemplateCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChecklistTemplate).where(ChecklistTemplate.id == template_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(404, "Template not found")
    for k, v in body.model_dump().items():
        setattr(obj, k, v)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/templates/{template_id}")
async def delete_template(template_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChecklistTemplate).where(ChecklistTemplate.id == template_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(404, "Template not found")
    await db.delete(obj)
    await db.commit()
    return {"ok": True}


# ─── Entries ─────────────────────────────────────────────────────────────────

@router.get("/entries", response_model=list[ChecklistEntryRead])
async def list_entries(snapshot_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ChecklistEntry)
        .options(selectinload(ChecklistEntry.status))
        .where(ChecklistEntry.snapshot_id == snapshot_id)
        # null status first, then by sort_order
        .order_by(
            ChecklistEntry.status_id.is_(None).desc(),
            ChecklistEntry.sort_order,
            ChecklistEntry.id,
        )
    )
    return result.scalars().all()


@router.post("/entries", response_model=ChecklistEntryRead)
async def create_entry(body: ChecklistEntryCreate, db: AsyncSession = Depends(get_db)):
    obj = ChecklistEntry(**body.model_dump())
    db.add(obj)
    await db.commit()
    result = await db.execute(
        select(ChecklistEntry)
        .options(selectinload(ChecklistEntry.status))
        .where(ChecklistEntry.id == obj.id)
    )
    return result.scalar_one()


@router.patch("/entries/{entry_id}", response_model=ChecklistEntryRead)
async def update_entry(entry_id: int, body: ChecklistEntryUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ChecklistEntry)
        .options(selectinload(ChecklistEntry.status))
        .where(ChecklistEntry.id == entry_id)
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(404, "Entry not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    obj.updated_at = datetime.now(timezone.utc)
    await db.commit()
    result = await db.execute(
        select(ChecklistEntry)
        .options(selectinload(ChecklistEntry.status))
        .where(ChecklistEntry.id == entry_id)
    )
    return result.scalar_one()


@router.delete("/entries/{entry_id}")
async def delete_entry(entry_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChecklistEntry).where(ChecklistEntry.id == entry_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(404, "Entry not found")
    await db.delete(obj)
    await db.commit()
    return {"ok": True}


@router.post("/entries/seed/{snapshot_id}", response_model=list[ChecklistEntryRead])
async def seed_entries_for_snapshot(snapshot_id: int, db: AsyncSession = Depends(get_db)):
    """Seed active templates into an existing snapshot, skipping templates already present."""
    existing = await db.execute(
        select(ChecklistEntry.template_id)
        .where(ChecklistEntry.snapshot_id == snapshot_id)
        .where(ChecklistEntry.template_id.is_not(None))
    )
    existing_template_ids = {row[0] for row in existing.all()}

    templates_result = await db.execute(
        select(ChecklistTemplate)
        .where(ChecklistTemplate.is_active == True)
        .order_by(ChecklistTemplate.sort_order, ChecklistTemplate.id)
    )
    created = []
    for tmpl in templates_result.scalars().all():
        if tmpl.id in existing_template_ids:
            continue
        entry = ChecklistEntry(
            snapshot_id=snapshot_id,
            template_id=tmpl.id,
            label=tmpl.label,
            sort_order=tmpl.sort_order,
        )
        db.add(entry)
        created.append(entry)

    await db.commit()

    if not created:
        return []

    ids = [e.id for e in created]
    result = await db.execute(
        select(ChecklistEntry)
        .options(selectinload(ChecklistEntry.status))
        .where(ChecklistEntry.id.in_(ids))
    )
    return result.scalars().all()
