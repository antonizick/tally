from pydantic import BaseModel
from datetime import datetime


class ChecklistStatusCreate(BaseModel):
    name: str
    color: str | None = None
    sort_order: int = 0


class ChecklistStatusRead(BaseModel):
    id: int
    name: str
    color: str | None
    sort_order: int

    model_config = {"from_attributes": True}


class ChecklistTemplateCreate(BaseModel):
    label: str
    description: str | None = None
    sort_order: int = 0
    is_active: bool = True


class ChecklistTemplateRead(BaseModel):
    id: int
    label: str
    description: str | None
    sort_order: int
    is_active: bool

    model_config = {"from_attributes": True}


class ChecklistEntryCreate(BaseModel):
    snapshot_id: int
    template_id: int | None = None
    label: str
    status_id: int | None = None
    note_1: str | None = None
    note_2: str | None = None
    sort_order: int = 0


class ChecklistEntryUpdate(BaseModel):
    status_id: int | None = None
    note_1: str | None = None
    note_2: str | None = None
    label: str | None = None


class ChecklistEntryRead(BaseModel):
    id: int
    snapshot_id: int
    template_id: int | None
    label: str
    status_id: int | None
    status: ChecklistStatusRead | None
    note_1: str | None
    note_2: str | None
    updated_at: datetime | str | None
    sort_order: int

    model_config = {"from_attributes": True}
