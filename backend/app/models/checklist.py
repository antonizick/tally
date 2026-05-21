from sqlalchemy import String, Integer, ForeignKey, DateTime, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class ChecklistStatus(Base):
    __tablename__ = "checklist_statuses"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    color: Mapped[str | None] = mapped_column(String(20))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    entries: Mapped[list["ChecklistEntry"]] = relationship(back_populates="status")


class ChecklistTemplate(Base):
    __tablename__ = "checklist_templates"

    id: Mapped[int] = mapped_column(primary_key=True)
    label: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(String(500))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    entries: Mapped[list["ChecklistEntry"]] = relationship(back_populates="template")


class ChecklistEntry(Base):
    __tablename__ = "checklist_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    snapshot_id: Mapped[int] = mapped_column(ForeignKey("monthly_snapshots.id"), index=True)
    template_id: Mapped[int | None] = mapped_column(ForeignKey("checklist_templates.id"))
    label: Mapped[str] = mapped_column(String(200))
    status_id: Mapped[int | None] = mapped_column(ForeignKey("checklist_statuses.id"))
    note_1: Mapped[str | None] = mapped_column(Text)
    note_2: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[str | None] = mapped_column(DateTime)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    snapshot: Mapped["MonthlySnapshot"] = relationship(back_populates="checklist_entries")
    template: Mapped["ChecklistTemplate | None"] = relationship(back_populates="entries")
    status: Mapped["ChecklistStatus | None"] = relationship(back_populates="entries")
