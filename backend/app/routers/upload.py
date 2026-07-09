"""CSV upload endpoint with schema mapping workflow."""
from fastapi import APIRouter, BackgroundTasks, UploadFile, File, Form, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import date as date_type
import json

from app.database import get_db
from app.models import Account, SchemaMapping
from app.services.csv_ingestion import ingest_csv, get_or_create_account, parse_csv_bytes
from app.services.schema_mapper import fingerprint_headers
from app.services.backup import background_backup

router = APIRouter(prefix="/api/upload", tags=["upload"])


def _parse_date_from(date_from: str | None) -> date_type | None:
    if not date_from:
        return None
    try:
        return date_type.fromisoformat(date_from)
    except ValueError:
        raise HTTPException(400, "date_from must be an ISO date (YYYY-MM-DD)")


@router.post("/csv")
async def upload_csv(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    account_id: int = Form(...),
    date_from: str | None = Form(None),
    preview: bool = Form(False),
    db: AsyncSession = Depends(get_db),
):
    """Upload a CSV file. preview=True returns counts only; otherwise runs the ingestion pipeline."""
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file")

    result = await ingest_csv(
        db=db,
        file_data=data,
        filename=file.filename or "upload.csv",
        account_id=account_id,
        date_from=_parse_date_from(date_from),
        preview=preview,
    )
    if result.get("status") == "complete":
        background_tasks.add_task(background_backup, "Automated backup for CSV import")
    return result


@router.post("/csv/confirm-mapping")
async def confirm_mapping(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    account_id: int = Form(...),
    mapping: str = Form(...),
    date_from: str | None = Form(None),
    preview: bool = Form(False),
    db: AsyncSession = Depends(get_db),
):
    """Re-submit CSV with user-confirmed column mapping. preview=True returns counts only."""
    data = await file.read()
    mapping_dict = json.loads(mapping)

    result = await ingest_csv(
        db=db,
        file_data=data,
        filename=file.filename or "upload.csv",
        account_id=account_id,
        mapping_override=mapping_dict,
        date_from=_parse_date_from(date_from),
        preview=preview,
    )
    if result.get("status") == "complete":
        background_tasks.add_task(background_backup, "Automated backup for CSV import")
    return result


@router.get("/accounts")
async def list_accounts(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Account).where(Account.is_active == True))
    return result.scalars().all()
