from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Body, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.config import settings
from app.services.backup import create_backup, list_backups
from app.services.restore import restore_from_upload
from app.services.factory_reset import factory_reset

router = APIRouter(prefix="/api/admin", tags=["admin"])


class BackupRequest(BaseModel):
    label: Optional[str] = None


@router.post("/backup")
async def do_backup(
    body: Optional[BackupRequest] = Body(default=None),
    db: AsyncSession = Depends(get_db),
):
    label = body.label if body else None
    try:
        return await create_backup(db, label=label)
    except Exception as e:
        raise HTTPException(500, f"Backup failed: {e}")


@router.get("/backups")
async def get_backups():
    return list_backups()


@router.get("/backup/download/{filename}")
async def download_backup(filename: str):
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(400, "Invalid filename")
    path = Path(settings.backups_dir) / filename
    if not path.exists() or not path.suffix == ".gz":
        raise HTTPException(404, "Backup not found")
    return FileResponse(
        path=str(path),
        media_type="application/gzip",
        filename=filename,
    )


@router.post("/restore")
async def do_restore(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    if not (file.filename or "").endswith(".tar.gz"):
        raise HTTPException(400, "File must be a .tar.gz archive")
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file")
    try:
        result = await restore_from_upload(db, data)
        return result
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        raise HTTPException(500, f"Restore failed: {e}")


@router.post("/restore/from-backup/{filename}")
async def do_restore_from_backup(
    filename: str,
    db: AsyncSession = Depends(get_db),
):
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(400, "Invalid filename")
    path = Path(settings.backups_dir) / filename
    if not path.exists() or not path.suffix == ".gz":
        raise HTTPException(404, "Backup not found")
    try:
        data = path.read_bytes()
        result = await restore_from_upload(db, data)
        return result
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        raise HTTPException(500, f"Restore failed: {e}")


@router.post("/reset")
async def do_reset(db: AsyncSession = Depends(get_db)):
    try:
        return await factory_reset(db)
    except Exception as e:
        raise HTTPException(500, f"Reset failed: {e}")
