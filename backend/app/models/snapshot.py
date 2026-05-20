from sqlalchemy import String, Float, Boolean, ForeignKey, DateTime, Date, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
from datetime import date


class MonthlySnapshot(Base):
    """Primary source for all net worth calculations."""
    __tablename__ = "monthly_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True)
    effective_date: Mapped[date] = mapped_column(Date, unique=True, index=True)
    notes: Mapped[str | None] = mapped_column(String(1000))
    is_confirmed: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[str] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    items: Mapped[list["SnapshotItem"]] = relationship(
        back_populates="snapshot", cascade="all, delete-orphan"
    )


class SnapshotItem(Base):
    """Individual asset or liability within a monthly snapshot."""
    __tablename__ = "snapshot_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    snapshot_id: Mapped[int] = mapped_column(ForeignKey("monthly_snapshots.id"), index=True)
    account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"))
    name: Mapped[str] = mapped_column(String(200))
    item_type: Mapped[str] = mapped_column(String(50))
    # asset types: checking, savings, retirement_401k, retirement_ira, brokerage, home, vehicle, other_asset
    # liability types: credit_card, car_loan, mortgage, other_liability
    value: Mapped[float] = mapped_column(Float)
    # for brokerage items: shares + ticker
    ticker: Mapped[str | None] = mapped_column(String(20))
    shares: Mapped[float | None] = mapped_column(Float)
    price_per_share: Mapped[float | None] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(20), default="manual")  # manual, yfinance, suggested
    is_asset: Mapped[bool] = mapped_column(Boolean, default=True)

    snapshot: Mapped["MonthlySnapshot"] = relationship(back_populates="items")
    account: Mapped["Account | None"] = relationship(back_populates="snapshot_items")
