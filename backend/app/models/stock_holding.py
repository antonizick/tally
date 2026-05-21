from sqlalchemy import String, Float, DateTime, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class StockHolding(Base):
    __tablename__ = "stock_holdings"

    id: Mapped[int] = mapped_column(primary_key=True)
    ticker: Mapped[str] = mapped_column(String(20))
    name: Mapped[str | None] = mapped_column(String(200))
    quantity: Mapped[float] = mapped_column(Float)
    created_at: Mapped[str] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (UniqueConstraint("ticker", name="uq_stock_holdings_ticker"),)
