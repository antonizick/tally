from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.database import get_db
from app.models.setting import Setting

router = APIRouter(prefix="/api/categorization-config", tags=["categorization-config"])

CONFIG_KEY = "categorization_exemptions"


class CategorizationConfig(BaseModel):
    # Case-insensitive substrings; if any appears in a transaction's description,
    # auto-categorization (rule-based and AI) is skipped and the transaction is
    # left pending for manual review.
    exemptions: list[str] = []


@router.get("/", response_model=CategorizationConfig)
async def get_categorization_config(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Setting).where(Setting.key == CONFIG_KEY))
    setting = result.scalar_one_or_none()
    if not setting:
        return CategorizationConfig()
    return CategorizationConfig(**setting.value)


@router.put("/", response_model=CategorizationConfig)
async def save_categorization_config(body: CategorizationConfig, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Setting).where(Setting.key == CONFIG_KEY))
    setting = result.scalar_one_or_none()
    data = body.model_dump()
    if setting:
        setting.value = data
    else:
        setting = Setting(key=CONFIG_KEY, value=data)
        db.add(setting)
    await db.commit()
    return body
