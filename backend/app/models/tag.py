from sqlalchemy import String, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    type: Mapped[str] = mapped_column(String(50), default="custom")  # person, project, custom
    color: Mapped[str | None] = mapped_column(String(20))
    created_at: Mapped[str] = mapped_column(DateTime, server_default=func.now())

    transaction_tags: Mapped[list["TransactionTag"]] = relationship(back_populates="tag")
