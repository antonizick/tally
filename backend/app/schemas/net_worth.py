from pydantic import BaseModel
from typing import Any


class NetWorthViewCreate(BaseModel):
    name: str
    definition: dict[str, Any]
    display_order: int = 0


class NetWorthViewRead(BaseModel):
    id: int
    name: str
    definition: dict[str, Any]
    display_order: int
    is_default: bool
    is_active: bool

    model_config = {"from_attributes": True}


class NetWorthResult(BaseModel):
    view_id: int
    view_name: str
    value: float
    effective_date: str
