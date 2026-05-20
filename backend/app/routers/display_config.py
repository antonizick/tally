from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.database import get_db
from app.models.setting import Setting

router = APIRouter(prefix="/api/display-config", tags=["display-config"])

CONFIG_KEY = "display_config"


class DisplayConfig(BaseModel):
    asset_order: list[str] = []
    liability_order: list[str] = []


@router.get("/", response_model=DisplayConfig)
async def get_display_config(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Setting).where(Setting.key == CONFIG_KEY))
    setting = result.scalar_one_or_none()
    if not setting:
        return DisplayConfig()
    return DisplayConfig(**setting.value)


@router.put("/", response_model=DisplayConfig)
async def save_display_config(body: DisplayConfig, db: AsyncSession = Depends(get_db)):
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
