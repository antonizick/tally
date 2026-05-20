from pydantic import BaseModel
from typing import Any
from datetime import datetime


class AccountCreate(BaseModel):
    name: str
    type: str
    institution: str | None = None
    account_number_masked: str | None = None
    currency: str = "USD"
    color: str | None = None


class AccountUpdate(BaseModel):
    name: str | None = None
    type: str | None = None
    institution: str | None = None
    color: str | None = None
    is_active: bool | None = None


class AccountRead(BaseModel):
    id: int
    name: str
    type: str
    institution: str | None
    account_number_masked: str | None
    currency: str
    color: str | None
    is_active: bool
    created_at: datetime | str

    model_config = {"from_attributes": True}


class SchemaMappingRead(BaseModel):
    id: int
    account_id: int
    header_fingerprint: str
    raw_headers: str
    column_mapping: dict[str, Any]
    date_format: str | None
    amount_type: str
    is_confirmed: bool

    model_config = {"from_attributes": True}


class SchemaMappingCreate(BaseModel):
    account_id: int
    header_fingerprint: str
    raw_headers: str
    column_mapping: dict[str, Any]
    date_format: str | None = None
    amount_type: str = "single"
