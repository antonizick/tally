from sqlalchemy import String, Float, Boolean, JSON, ForeignKey, DateTime, Date, func, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
from datetime import date


class ImportBatch(Base):
    __tablename__ = "import_batches"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"))
    filename: Mapped[str] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(50), default="pending")  # pending, processing, complete, failed
    total_rows: Mapped[int] = mapped_column(default=0)
    imported_rows: Mapped[int] = mapped_column(default=0)
    duplicate_rows: Mapped[int] = mapped_column(default=0)
    error_message: Mapped[str | None] = mapped_column(String(1000))
    created_at: Mapped[str] = mapped_column(DateTime, server_default=func.now())
    completed_at: Mapped[str | None] = mapped_column(DateTime)

    transactions: Mapped[list["Transaction"]] = relationship(back_populates="import_batch")


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    import_batch_id: Mapped[int | None] = mapped_column(ForeignKey("import_batches.id"))
    date: Mapped[date] = mapped_column(Date, index=True)
    description: Mapped[str] = mapped_column(String(500))
    original_description: Mapped[str | None] = mapped_column(String(500))
    amount: Mapped[float] = mapped_column(Float)  # negative = debit/expense
    balance: Mapped[float | None] = mapped_column(Float)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="posted")  # pending, posted
    review_status: Mapped[str] = mapped_column(String(20), default="pending")  # pending, approved, overridden
    confidence: Mapped[float | None] = mapped_column(Float)  # AI confidence 0-1
    ai_category_suggestion: Mapped[str | None] = mapped_column(String(200))
    is_transfer: Mapped[bool] = mapped_column(Boolean, default=False)
    transfer_pair_id: Mapped[int | None] = mapped_column(ForeignKey("transactions.id"))
    raw_source: Mapped[dict | None] = mapped_column(JSON)
    dedup_hash: Mapped[str | None] = mapped_column(String(64), index=True)
    created_at: Mapped[str] = mapped_column(DateTime, server_default=func.now())

    account: Mapped["Account"] = relationship(back_populates="transactions")
    category: Mapped["Category | None"] = relationship(back_populates="transactions")
    import_batch: Mapped["ImportBatch | None"] = relationship(back_populates="transactions")
    tags: Mapped[list["TransactionTag"]] = relationship(back_populates="transaction", cascade="all, delete-orphan")
    corrections: Mapped[list["CorrectionHistory"]] = relationship(back_populates="transaction")

    __table_args__ = (
        Index("ix_transactions_date_account", "date", "account_id"),
    )


class TransactionTag(Base):
    __tablename__ = "transaction_tags"

    transaction_id: Mapped[int] = mapped_column(ForeignKey("transactions.id"), primary_key=True)
    tag_id: Mapped[int] = mapped_column(ForeignKey("tags.id"), primary_key=True)

    transaction: Mapped["Transaction"] = relationship(back_populates="tags")
    tag: Mapped["Tag"] = relationship(back_populates="transaction_tags")


class CorrectionHistory(Base):
    """RAG source: user corrections for AI learning."""
    __tablename__ = "correction_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    transaction_id: Mapped[int] = mapped_column(ForeignKey("transactions.id"))
    description: Mapped[str] = mapped_column(String(500))
    original_category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"))
    user_category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"))
    original_category_name: Mapped[str | None] = mapped_column(String(200))
    user_category_name: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[str] = mapped_column(DateTime, server_default=func.now())

    transaction: Mapped["Transaction"] = relationship(back_populates="corrections")
