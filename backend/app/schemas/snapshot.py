from pydantic import BaseModel
from datetime import datetime, date as date_type


class SnapshotItemCreate(BaseModel):
    name: str
    item_type: str
    value: float
    account_id: int | None = None
    ticker: str | None = None
    shares: float | None = None
    price_per_share: float | None = None
    source: str = "manual"
    is_asset: bool = True


class SnapshotItemRead(BaseModel):
    id: int
    snapshot_id: int
    account_id: int | None
    name: str
    item_type: str
    value: float
    ticker: str | None
    shares: float | None
    price_per_share: float | None
    source: str
    is_asset: bool

    model_config = {"from_attributes": True}


class MonthlySnapshotCreate(BaseModel):
    effective_date: str  # YYYY-MM-DD
    notes: str | None = None
    items: list[SnapshotItemCreate] = []


class MonthlySnapshotUpdate(BaseModel):
    effective_date: str | None = None  # YYYY-MM-DD
    notes: str | None = None
    items: list[SnapshotItemCreate] | None = None


class MonthlySnapshotRead(BaseModel):
    id: int
    effective_date: datetime | date_type | str
    notes: str | None
    is_confirmed: bool
    total_assets: float = 0.0
    total_liabilities: float = 0.0
    net_worth: float = 0.0
    items: list[SnapshotItemRead] = []
    created_at: datetime | str

    model_config = {"from_attributes": True}
