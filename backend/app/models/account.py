from sqlalchemy import String, Boolean, JSON, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
import enum


class AccountType(str, enum.Enum):
    CHECKING = "checking"
    SAVINGS = "savings"
    CREDIT_CARD = "credit_card"
    RETIREMENT_401K = "retirement_401k"
    RETIREMENT_IRA = "retirement_ira"
    BROKERAGE = "brokerage"
    HOME = "home"
    VEHICLE = "vehicle"
    OTHER_ASSET = "other_asset"
    LOAN = "loan"
    MORTGAGE = "mortgage"
    OTHER_LIABILITY = "other_liability"


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    type: Mapped[str] = mapped_column(String(50))
    institution: Mapped[str | None] = mapped_column(String(200))
    account_number_masked: Mapped[str | None] = mapped_column(String(50))
    currency: Mapped[str] = mapped_column(String(10), default="USD")
    color: Mapped[str | None] = mapped_column(String(20))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[str] = mapped_column(DateTime, server_default=func.now())

    transactions: Mapped[list["Transaction"]] = relationship(back_populates="account")
    schema_mappings: Mapped[list["SchemaMapping"]] = relationship(back_populates="account")
    snapshot_items: Mapped[list["SnapshotItem"]] = relationship(back_populates="account")


class SchemaMapping(Base):
    """Persists CSV column mappings per account/fingerprint so re-imports are automatic."""
    __tablename__ = "schema_mappings"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"))
    header_fingerprint: Mapped[str] = mapped_column(String(64), index=True)
    raw_headers: Mapped[str] = mapped_column(String(1000))
    column_mapping: Mapped[dict] = mapped_column(JSON)
    date_format: Mapped[str | None] = mapped_column(String(50))
    amount_type: Mapped[str] = mapped_column(String(20), default="single")
    is_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[str] = mapped_column(DateTime, server_default=func.now())

    account: Mapped["Account"] = relationship(back_populates="schema_mappings")
