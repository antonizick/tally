from sqlalchemy import String, Float, Boolean, JSON, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class RecurringBill(Base):
    __tablename__ = "recurring_bills"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    expected_amount: Mapped[float | None] = mapped_column(Float)
    due_day: Mapped[int | None] = mapped_column()  # day of month 1-31
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"))
    tag_ids: Mapped[list] = mapped_column(JSON, default=list)
    match_keywords: Mapped[list] = mapped_column(JSON, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_ai_suggested: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[str] = mapped_column(DateTime, server_default=func.now())
