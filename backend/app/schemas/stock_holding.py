from pydantic import BaseModel
from datetime import datetime


class StockHoldingCreate(BaseModel):
    ticker: str
    name: str | None = None
    quantity: float


class StockHoldingUpdate(BaseModel):
    quantity: float | None = None
    name: str | None = None


class StockHoldingRead(BaseModel):
    id: int
    ticker: str
    name: str | None
    quantity: float
    created_at: datetime | str

    model_config = {"from_attributes": True}
