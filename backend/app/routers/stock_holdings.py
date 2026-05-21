from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.stock_holding import StockHolding
from app.schemas.stock_holding import StockHoldingCreate, StockHoldingRead, StockHoldingUpdate
from app.services.stock_price_service import get_portfolio_trend

router = APIRouter(prefix="/api/stock-holdings", tags=["stock-holdings"])


@router.get("/", response_model=list[StockHoldingRead])
async def list_holdings(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(StockHolding).order_by(StockHolding.ticker))
    return result.scalars().all()


@router.get("/portfolio-trend")
async def portfolio_trend(db: AsyncSession = Depends(get_db)):
    return await get_portfolio_trend(db)


@router.post("/", response_model=StockHoldingRead)
async def create_holding(body: StockHoldingCreate, db: AsyncSession = Depends(get_db)):
    body.ticker = body.ticker.upper().strip()
    existing = await db.execute(select(StockHolding).where(StockHolding.ticker == body.ticker))
    if existing.scalar_one_or_none():
        raise HTTPException(400, f"Ticker {body.ticker} already exists")
    holding = StockHolding(**body.model_dump())
    db.add(holding)
    await db.commit()
    await db.refresh(holding)
    return holding


@router.patch("/{holding_id}", response_model=StockHoldingRead)
async def update_holding(holding_id: int, body: StockHoldingUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(StockHolding).where(StockHolding.id == holding_id))
    holding = result.scalar_one_or_none()
    if not holding:
        raise HTTPException(404, "Holding not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(holding, field, value)
    await db.commit()
    await db.refresh(holding)
    return holding


@router.delete("/{holding_id}")
async def delete_holding(holding_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(StockHolding).where(StockHolding.id == holding_id))
    holding = result.scalar_one_or_none()
    if not holding:
        raise HTTPException(404, "Holding not found")
    await db.delete(holding)
    await db.commit()
    return {"ok": True}
