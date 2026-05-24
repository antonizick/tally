from pydantic import BaseModel
from typing import Any
from datetime import datetime, date as date_type


class TagRead(BaseModel):
    id: int
    name: str
    type: str
    color: str | None

    model_config = {"from_attributes": True}


class TransactionRead(BaseModel):
    id: int
    account_id: int
    date: datetime | date_type | str
    description: str
    original_description: str | None
    amount: float
    balance: float | None
    category_id: int | None
    category_name: str | None = None
    status: str
    review_status: str
    confidence: float | None
    ai_category_suggestion: str | None
    is_transfer: bool
    tags: list[TagRead] = []
    notes: str | None = None
    created_at: datetime | str
    source_file: str | None = None

    model_config = {"from_attributes": True}


class TransactionUpdate(BaseModel):
    category_id: int | None = None
    description: str | None = None
    review_status: str | None = None
    is_transfer: bool | None = None
    tag_ids: list[int] | None = None
    notes: str | None = None


class ImportBatchRead(BaseModel):
    id: int
    account_id: int
    filename: str
    status: str
    total_rows: int
    imported_rows: int
    duplicate_rows: int
    error_message: str | None
    created_at: datetime | str
    completed_at: datetime | str | None

    model_config = {"from_attributes": True}


class TransactionFilter(BaseModel):
    account_ids: list[int] | None = None
    category_ids: list[int] | None = None
    tag_ids: list[int] | None = None
    date_from: str | None = None
    date_to: str | None = None
    review_status: str | None = None
    search: str | None = None
    min_amount: float | None = None
    max_amount: float | None = None
    page: int = 1
    page_size: int = 50
