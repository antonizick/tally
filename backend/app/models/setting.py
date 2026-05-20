from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, JSON
from app.database import Base


class Setting(Base):
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[dict] = mapped_column(JSON, nullable=False)
