from sqlalchemy import String, Float, Date, DateTime, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class StockPriceHistory(Base):
    __tablename__ = "stock_price_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    ticker: Mapped[str] = mapped_column(String(20), index=True)
    week_date: Mapped[str] = mapped_column(Date, index=True)  # Monday of the week
    close_price: Mapped[float] = mapped_column(Float)
    fetched_at: Mapped[str] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (UniqueConstraint("ticker", "week_date", name="uq_stock_price_week"),)
