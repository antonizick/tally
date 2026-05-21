from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from datetime import date
import httpx

from app.database import get_db
from app.models import MonthlySnapshot, SnapshotItem
from app.models.checklist import ChecklistTemplate, ChecklistEntry
from app.schemas.snapshot import MonthlySnapshotCreate, MonthlySnapshotRead, MonthlySnapshotUpdate, SnapshotItemRead
from app.services.backup import background_backup

router = APIRouter(prefix="/api/snapshots", tags=["snapshots"])


def _compute_totals(snapshot: MonthlySnapshot) -> dict:
    assets = sum(item.value for item in snapshot.items if item.is_asset)
    liabilities = sum(item.value for item in snapshot.items if not item.is_asset)
    return {
        "id": snapshot.id,
        "effective_date": str(snapshot.effective_date),
        "notes": snapshot.notes,
        "is_confirmed": snapshot.is_confirmed,
        "total_assets": assets,
        "total_liabilities": liabilities,
        "net_worth": assets - liabilities,
        "items": [
            SnapshotItemRead.model_validate(item).model_dump()
            for item in snapshot.items
        ],
        "created_at": str(snapshot.created_at),
    }


@router.get("/", response_model=list[MonthlySnapshotRead])
async def list_snapshots(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MonthlySnapshot)
        .options(selectinload(MonthlySnapshot.items))
        .order_by(MonthlySnapshot.effective_date.desc())
    )
    snapshots = result.scalars().all()
    return [_compute_totals(s) for s in snapshots]


@router.get("/latest", response_model=MonthlySnapshotRead)
async def latest_snapshot(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MonthlySnapshot)
        .options(selectinload(MonthlySnapshot.items))
        .order_by(MonthlySnapshot.effective_date.desc())
        .limit(1)
    )
    snap = result.scalar_one_or_none()
    if not snap:
        raise HTTPException(404, "No snapshots found")
    return _compute_totals(snap)


@router.get("/{snapshot_id}", response_model=MonthlySnapshotRead)
async def get_snapshot(snapshot_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MonthlySnapshot)
        .options(selectinload(MonthlySnapshot.items))
        .where(MonthlySnapshot.id == snapshot_id)
    )
    snap = result.scalar_one_or_none()
    if not snap:
        raise HTTPException(404, "Snapshot not found")
    return _compute_totals(snap)


@router.post("/", response_model=MonthlySnapshotRead)
async def create_snapshot(body: MonthlySnapshotCreate, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    eff_date = body.effective_date if isinstance(body.effective_date, date) else date.fromisoformat(str(body.effective_date))
    snap = MonthlySnapshot(
        effective_date=eff_date,
        notes=body.notes,
    )
    db.add(snap)
    await db.flush()

    for item_data in body.items:
        item = SnapshotItem(snapshot_id=snap.id, **item_data.model_dump())
        db.add(item)

    # Seed checklist entries from active templates
    templates_result = await db.execute(
        select(ChecklistTemplate)
        .where(ChecklistTemplate.is_active == True)
        .order_by(ChecklistTemplate.sort_order, ChecklistTemplate.id)
    )
    for tmpl in templates_result.scalars().all():
        entry = ChecklistEntry(
            snapshot_id=snap.id,
            template_id=tmpl.id,
            label=tmpl.label,
            sort_order=tmpl.sort_order,
        )
        db.add(entry)

    await db.commit()
    await db.refresh(snap)

    result = await db.execute(
        select(MonthlySnapshot)
        .options(selectinload(MonthlySnapshot.items))
        .where(MonthlySnapshot.id == snap.id)
    )
    snap = result.scalar_one()
    background_tasks.add_task(background_backup, "Automated backup for monthly snapshot")
    return _compute_totals(snap)


@router.put("/{snapshot_id}", response_model=MonthlySnapshotRead)
async def update_snapshot(snapshot_id: int, body: MonthlySnapshotUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MonthlySnapshot)
        .options(selectinload(MonthlySnapshot.items))
        .where(MonthlySnapshot.id == snapshot_id)
    )
    snap = result.scalar_one_or_none()
    if not snap:
        raise HTTPException(404, "Snapshot not found")

    if body.effective_date is not None:
        snap.effective_date = date.fromisoformat(body.effective_date)

    if body.notes is not None:
        snap.notes = body.notes

    if body.items is not None:
        # Replace all items
        for old_item in snap.items:
            await db.delete(old_item)
        await db.flush()
        for item_data in body.items:
            item = SnapshotItem(snapshot_id=snap.id, **item_data.model_dump())
            db.add(item)

    await db.commit()

    result = await db.execute(
        select(MonthlySnapshot)
        .options(selectinload(MonthlySnapshot.items))
        .where(MonthlySnapshot.id == snapshot_id)
    )
    snap = result.scalar_one()
    return _compute_totals(snap)


@router.delete("/{snapshot_id}")
async def delete_snapshot(snapshot_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MonthlySnapshot).where(MonthlySnapshot.id == snapshot_id))
    snap = result.scalar_one_or_none()
    if not snap:
        raise HTTPException(404, "Snapshot not found")
    await db.delete(snap)
    await db.commit()
    return {"ok": True}


@router.get("/stock-price/{ticker}")
async def get_stock_price(ticker: str):
    """Fetch current stock price via yfinance."""
    try:
        import yfinance as yf
        info = yf.Ticker(ticker).fast_info
        price = info.last_price or info.regular_market_price
        return {"ticker": ticker.upper(), "price": price, "currency": "USD"}
    except Exception as e:
        raise HTTPException(400, f"Could not fetch price for {ticker}: {e}")
