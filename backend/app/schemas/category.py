from pydantic import BaseModel


class CategoryCreate(BaseModel):
    name: str
    parent_id: int | None = None
    color: str | None = None
    icon: str | None = None


class CategoryUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    icon: str | None = None
    parent_id: int | None = None


class CategoryRead(BaseModel):
    id: int
    name: str
    parent_id: int | None
    color: str | None
    icon: str | None
    children: list["CategoryRead"] = []
    transaction_count: int = 0

    model_config = {"from_attributes": True}
