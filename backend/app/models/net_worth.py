from sqlalchemy import String, Boolean, JSON, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

# Built-in named views matching the planning document
DEFAULT_NET_WORTH_VIEWS = [
    {
        "name": "Retirement accounts (no house, no stocks)",
        "include_types": ["retirement_401k", "retirement_ira"],
        "exclude_liabilities": False,
        "is_default": True,
    },
    {
        "name": "Retirement accounts and stocks (no house)",
        "include_types": ["retirement_401k", "retirement_ira", "brokerage"],
        "exclude_liabilities": False,
        "is_default": True,
    },
    {
        "name": "On hand cash (no stock) (not including debt)",
        "include_types": ["checking", "savings"],
        "exclude_liabilities": False,
        "is_default": True,
    },
    {
        "name": "On hand (no stock) after all debt (car included)",
        "include_types": ["checking", "savings"],
        "exclude_types": ["car_loan", "mortgage", "credit_card", "other_liability"],
        "exclude_liabilities": True,
        "is_default": True,
    },
    {
        "name": "On hand & stock after all debt (car included)",
        "include_types": ["checking", "savings", "brokerage"],
        "exclude_types": ["car_loan", "mortgage", "credit_card", "other_liability"],
        "exclude_liabilities": True,
        "is_default": True,
    },
    {
        "name": "Retirement accounts, stocks, cash (no house)",
        "include_types": ["checking", "savings", "retirement_401k", "retirement_ira", "brokerage"],
        "exclude_liabilities": False,
        "is_default": True,
    },
    {
        "name": "The whole enchilada",
        "include_types": [],  # all
        "exclude_types": [],
        "exclude_liabilities": True,
        "is_default": True,
    },
]


class NetWorthView(Base):
    __tablename__ = "net_worth_views"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    definition: Mapped[dict] = mapped_column(JSON)
    # definition schema:
    # {
    #   "include_types": [...],   # empty = all
    #   "exclude_types": [...],
    #   "include_account_ids": [...],
    #   "exclude_account_ids": [...],
    #   "exclude_liabilities": bool,
    # }
    display_order: Mapped[int] = mapped_column(default=0)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[str] = mapped_column(DateTime, server_default=func.now())
