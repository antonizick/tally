"""Pivot/reports endpoints powered by DuckDB."""
from fastapi import APIRouter, Query
from app.services.analytics import spending_by_category, monthly_spending_trend, pivot_transactions

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/spending-by-category")
async def spending_by_cat(
    date_from: str = Query(...),
    date_to: str = Query(...),
    account_ids: str | None = Query(None),
    category_ids: str | None = Query(None),
):
    acct_ids = [int(i) for i in account_ids.split(",") if i.strip()] if account_ids else None
    cat_ids = [int(i) for i in category_ids.split(",") if i.strip()] if category_ids else None
    return spending_by_category(date_from, date_to, acct_ids, cat_ids)


@router.get("/monthly-trend")
async def monthly_trend(
    months: int = Query(12),
    account_ids: str | None = Query(None),
):
    acct_ids = [int(i) for i in account_ids.split(",") if i.strip()] if account_ids else None
    return monthly_spending_trend(months, acct_ids)


@router.get("/pivot")
async def pivot(
    date_from: str = Query(...),
    date_to: str = Query(...),
    group_by: str = Query("category"),
    account_ids: str | None = Query(None),
    category_ids: str | None = Query(None),
):
    acct_ids = [int(i) for i in account_ids.split(",") if i.strip()] if account_ids else None
    cat_ids = [int(i) for i in category_ids.split(",") if i.strip()] if category_ids else None
    return pivot_transactions(date_from, date_to, group_by, acct_ids, cat_ids)
