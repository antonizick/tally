from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.database import get_db
from app.models import NetWorthView, MonthlySnapshot, SnapshotItem
from app.models.net_worth import DEFAULT_NET_WORTH_VIEWS
from app.schemas.net_worth import NetWorthViewCreate, NetWorthViewRead, NetWorthResult

router = APIRouter(prefix="/api/net-worth", tags=["net-worth"])


def compute_view(view: NetWorthView, snapshot: MonthlySnapshot) -> float:
    defn = view.definition
    include_types = set(defn.get("include_types") or [])
    exclude_types = set(defn.get("exclude_types") or [])
    include_account_ids = set(defn.get("include_account_ids") or [])
    exclude_account_ids = set(defn.get("exclude_account_ids") or [])
    exclude_liabilities = defn.get("exclude_liabilities", False)

    total = 0.0
    for item in snapshot.items:
        if not item.is_asset and exclude_liabilities:
            total -= abs(item.value)
            continue
        if not item.is_asset and not exclude_liabilities:
            continue  # skip liabilities in non-whole-enchilada views unless specified

        if include_types and item.item_type not in include_types:
            continue
        if item.item_type in exclude_types:
            continue
        if include_account_ids and item.account_id not in include_account_ids:
            continue
        if item.account_id in exclude_account_ids:
            continue

        total += item.value if item.is_asset else -abs(item.value)

    return total


@router.get("/views", response_model=list[NetWorthViewRead])
async def list_views(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(NetWorthView)
        .where(NetWorthView.is_active == True)
        .order_by(NetWorthView.display_order)
    )
    return result.scalars().all()


@router.post("/views", response_model=NetWorthViewRead)
async def create_view(body: NetWorthViewCreate, db: AsyncSession = Depends(get_db)):
    view = NetWorthView(**body.model_dump())
    db.add(view)
    await db.commit()
    await db.refresh(view)
    return view


@router.delete("/views/{view_id}")
async def delete_view(view_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(NetWorthView).where(NetWorthView.id == view_id))
    view = result.scalar_one_or_none()
    if not view:
        raise HTTPException(404, "View not found")
    view.is_active = False
    await db.commit()
    return {"ok": True}


@router.get("/calculate")
async def calculate_net_worth(
    snapshot_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Compute all active net worth views for a snapshot (default: latest)."""
    if snapshot_id:
        result = await db.execute(
            select(MonthlySnapshot)
            .options(selectinload(MonthlySnapshot.items))
            .where(MonthlySnapshot.id == snapshot_id)
        )
    else:
        result = await db.execute(
            select(MonthlySnapshot)
            .options(selectinload(MonthlySnapshot.items))
            .order_by(MonthlySnapshot.effective_date.desc())
            .limit(1)
        )
    snapshot = result.scalar_one_or_none()
    if not snapshot:
        return []

    views_result = await db.execute(
        select(NetWorthView).where(NetWorthView.is_active == True).order_by(NetWorthView.display_order)
    )
    views = views_result.scalars().all()

    return [
        {
            "view_id": v.id,
            "view_name": v.name,
            "value": compute_view(v, snapshot),
            "effective_date": str(snapshot.effective_date),
        }
        for v in views
    ]


@router.post("/seed-views")
async def seed_default_views(db: AsyncSession = Depends(get_db)):
    """Create the default named net worth views from the planning document."""
    existing = (await db.execute(select(NetWorthView))).scalars().all()
    if existing:
        return {"message": "Views already exist", "count": len(existing)}

    for i, view_def in enumerate(DEFAULT_NET_WORTH_VIEWS):
        view = NetWorthView(
            name=view_def["name"],
            definition={
                "include_types": view_def.get("include_types", []),
                "exclude_types": view_def.get("exclude_types", []),
                "exclude_liabilities": view_def.get("exclude_liabilities", False),
            },
            display_order=i,
            is_default=True,
        )
        db.add(view)

    await db.commit()
    return {"message": "Default views seeded", "count": len(DEFAULT_NET_WORTH_VIEWS)}


@router.get("/detail-trend")
async def net_worth_detail_trend(db: AsyncSession = Depends(get_db)):
    """Per-item trend across all snapshots — individual asset/liability lines."""
    result = await db.execute(
        select(MonthlySnapshot)
        .options(selectinload(MonthlySnapshot.items))
        .order_by(MonthlySnapshot.effective_date.asc())
    )
    snapshots = result.scalars().all()
    return [
        {
            "date": str(snap.effective_date),
            "items": [
                {"name": item.name, "value": float(item.value), "is_asset": bool(item.is_asset)}
                for item in snap.items
            ],
        }
        for snap in snapshots
    ]


@router.get("/trend")
async def net_worth_trend(db: AsyncSession = Depends(get_db)):
    """Net worth trend across all snapshots for the chart."""
    result = await db.execute(
        select(MonthlySnapshot)
        .options(selectinload(MonthlySnapshot.items))
        .order_by(MonthlySnapshot.effective_date.asc())
    )
    snapshots = result.scalars().all()

    trend = []
    for snap in snapshots:
        assets = sum(i.value for i in snap.items if i.is_asset)
        liabilities = sum(i.value for i in snap.items if not i.is_asset)
        trend.append({
            "date": str(snap.effective_date),
            "assets": assets,
            "liabilities": liabilities,
            "net_worth": assets - liabilities,
        })
    return trend
