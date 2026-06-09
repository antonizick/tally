"""Dashboard summary endpoint — aggregates all widgets in one call."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import aliased
from sqlalchemy.orm import selectinload
from datetime import date, timedelta
from app.database import get_db
from app.models import Transaction, MonthlySnapshot, NetWorthView, Category
from app.routers.net_worth import compute_view

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _view_items(view: "NetWorthView", snapshot: "MonthlySnapshot") -> list[dict]:
    """Return the individual items that contribute to a net worth view."""
    defn = view.definition
    include_types = set(defn.get("include_types") or [])
    exclude_types = set(defn.get("exclude_types") or [])
    include_account_ids = set(defn.get("include_account_ids") or [])
    exclude_account_ids = set(defn.get("exclude_account_ids") or [])
    exclude_liabilities = defn.get("exclude_liabilities", False)

    items = []
    for item in snapshot.items:
        if not item.is_asset and exclude_liabilities:
            items.append({"name": item.name, "value": float(item.value), "is_asset": False})
            continue
        if not item.is_asset and not exclude_liabilities:
            continue
        if include_types and item.item_type not in include_types:
            continue
        if item.item_type in exclude_types:
            continue
        if include_account_ids and item.account_id not in include_account_ids:
            continue
        if item.account_id in exclude_account_ids:
            continue
        items.append({"name": item.name, "value": float(item.value), "is_asset": item.is_asset})

    return sorted(items, key=lambda x: -x["value"])


@router.get("/summary")
async def dashboard_summary(
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    months: int = Query(1, description="Fallback: how many months back from today"),
    show_quiet: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()
    if date_from and date_to:
        period_start = date.fromisoformat(date_from)
        period_end = date.fromisoformat(date_to)
    else:
        first_of_month = today.replace(day=1)
        period_start = (first_of_month - timedelta(days=1)).replace(day=1) if months > 1 else first_of_month
        period_end = today

    # Net worth from the most recent snapshot on or before period_end
    snap_result = await db.execute(
        select(MonthlySnapshot)
        .options(selectinload(MonthlySnapshot.items))
        .where(MonthlySnapshot.effective_date <= period_end)
        .order_by(MonthlySnapshot.effective_date.desc())
        .limit(1)
    )
    latest_snapshot = snap_result.scalar_one_or_none()

    # Previous snapshot: most recent one strictly before period_start
    prev_snap_result = await db.execute(
        select(MonthlySnapshot)
        .options(selectinload(MonthlySnapshot.items))
        .where(MonthlySnapshot.effective_date < period_start)
        .order_by(MonthlySnapshot.effective_date.desc())
        .limit(1)
    )
    prev_snapshot = prev_snap_result.scalar_one_or_none()

    net_worth_views = []
    if latest_snapshot:
        views_result = await db.execute(
            select(NetWorthView)
            .where(NetWorthView.is_active == True)
            .order_by(NetWorthView.display_order)
        )
        for view in views_result.scalars().all():
            current_val = compute_view(view, latest_snapshot)
            prev_val = compute_view(view, prev_snapshot) if prev_snapshot else None
            net_worth_views.append({
                "id": view.id,
                "name": view.name,
                "value": current_val,
                "prev_value": prev_val,
                "items": _view_items(view, latest_snapshot),
            })

    # Spending summary for period
    tx_filter = [
        Transaction.date >= str(period_start),
        Transaction.date <= str(period_end),
        Transaction.is_transfer == False,
    ]

    # Get Income category ID and its children for accurate income calculation
    income_parent_id = (await db.execute(
        select(Category.id).where(Category.name == "Income")
    )).scalar_one_or_none()
    income_category_ids: set[int] = set()
    if income_parent_id:
        income_category_ids.add(income_parent_id)
        income_child_rows = (await db.execute(
            select(Category.id).where(Category.parent_id == income_parent_id)
        )).scalars().all()
        income_category_ids.update(income_child_rows)

    summary_result = await db.execute(
        select(
            func.sum(Transaction.amount).filter(Transaction.amount < 0).label("expenses"),
            func.sum(Transaction.amount).filter(Transaction.category_id.in_(income_category_ids) if income_category_ids else False).label("income"),
            func.count(Transaction.id).label("count"),
            func.count(Transaction.id).filter(Transaction.review_status == "pending").label("pending"),
        ).where(and_(*tx_filter))
    )
    summary = summary_result.one()

    # Resolve excluded category IDs (Salary always, Quiet optionally)
    excluded_ids: set[int] = set()

    # Always exclude Salary category and its children
    salary_parent_id = (await db.execute(
        select(Category.id).where(Category.name == "Salary")
    )).scalar_one_or_none()
    if salary_parent_id:
        excluded_ids.add(salary_parent_id)
        child_rows = (await db.execute(
            select(Category.id).where(Category.parent_id == salary_parent_id)
        )).scalars().all()
        excluded_ids.update(child_rows)

    # Exclude Quiet category and its children when show_quiet=False
    if not show_quiet:
        quiet_parent_id = (await db.execute(
            select(Category.id).where(Category.name == "Quiet")
        )).scalar_one_or_none()
        if quiet_parent_id:
            excluded_ids.add(quiet_parent_id)
            child_rows = (await db.execute(
                select(Category.id).where(Category.parent_id == quiet_parent_id)
            )).scalars().all()
            excluded_ids.update(child_rows)

    # Top spending categories (with id + color + parent for navigation and chart)
    # Include all transactions regardless of amount sign; categorization determines expense/income
    # Always exclude Salary; exclude Quiet when show_quiet=False
    ParentCat = aliased(Category)
    top_cat_filters = [*tx_filter]
    if excluded_ids:
        top_cat_filters.append(Category.id.notin_(excluded_ids))
    top_cats_result = await db.execute(
        select(
            Category.id,
            Category.name,
            Category.color,
            Category.parent_id,
            ParentCat.name.label("parent_name"),
            func.sum(Transaction.amount).label("total"),
            func.count(Transaction.id).label("count"),
        )
        .join(Transaction, Transaction.category_id == Category.id)
        .outerjoin(ParentCat, ParentCat.id == Category.parent_id)
        .where(and_(*top_cat_filters))
        .group_by(Category.id, Category.name, Category.color, Category.parent_id, ParentCat.name)
        .order_by(func.abs(func.sum(Transaction.amount)).desc())
    )
    top_categories = [
        {
            "id": r.id, "name": r.name, "color": r.color,
            "parent_name": r.parent_name,
            "total": float(r.total), "count": r.count,
        }
        for r in top_cats_result.all()
    ]

    # Review queue count — only flag transactions on/after 2026-05-01
    pending_count = (
        await db.execute(
            select(func.count(Transaction.id)).where(
                Transaction.review_status == "pending",
                Transaction.date >= "2026-05-01",
            )
        )
    ).scalar_one()

    total_assets = sum(i.value for i in latest_snapshot.items if i.is_asset) if latest_snapshot else 0
    total_liabilities = sum(i.value for i in latest_snapshot.items if not i.is_asset) if latest_snapshot else 0
    prev_total_assets = sum(i.value for i in prev_snapshot.items if i.is_asset) if prev_snapshot else None
    prev_total_liabilities = sum(i.value for i in prev_snapshot.items if not i.is_asset) if prev_snapshot else None

    asset_items = sorted(
        [{"name": i.name, "value": float(i.value), "is_asset": True} for i in latest_snapshot.items if i.is_asset],
        key=lambda x: -x["value"],
    ) if latest_snapshot else []
    liability_items = sorted(
        [{"name": i.name, "value": float(i.value), "is_asset": False} for i in latest_snapshot.items if not i.is_asset],
        key=lambda x: -x["value"],
    ) if latest_snapshot else []

    return {
        "period_start": str(period_start),
        "period_end": str(period_end),
        "net_worth_views": net_worth_views,
        "latest_snapshot_date": str(latest_snapshot.effective_date) if latest_snapshot else None,
        "total_assets": total_assets,
        "total_liabilities": total_liabilities,
        "prev_total_assets": float(prev_total_assets) if prev_total_assets is not None else None,
        "prev_total_liabilities": float(prev_total_liabilities) if prev_total_liabilities is not None else None,
        "asset_items": asset_items,
        "liability_items": liability_items,
        "period_expenses": float(summary.expenses or 0),
        "period_income": float(summary.income or 0),
        "period_transaction_count": summary.count,
        "pending_review_count": pending_count,
        "top_categories": top_categories,
        "income_category_ids": list(income_category_ids),
    }
