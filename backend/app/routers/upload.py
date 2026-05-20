"""CSV upload endpoint with schema mapping workflow."""
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import json

from app.database import get_db
from app.models import Account, SchemaMapping
from app.services.csv_ingestion import ingest_csv, get_or_create_account, parse_csv_bytes
from app.services.schema_mapper import fingerprint_headers

router = APIRouter(prefix="/api/upload", tags=["upload"])


@router.post("/csv")
async def upload_csv(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    account_id: int = Form(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload a CSV file and start the ingestion pipeline."""
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file")

    result = await ingest_csv(
        db=db,
        file_data=data,
        filename=file.filename or "upload.csv",
        account_id=account_id,
    )
    return result


@router.post("/csv/confirm-mapping")
async def confirm_mapping(
    file: UploadFile = File(...),
    account_id: int = Form(...),
    mapping: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    """Re-submit CSV with user-confirmed column mapping."""
    data = await file.read()
    mapping_dict = json.loads(mapping)

    result = await ingest_csv(
        db=db,
        file_data=data,
        filename=file.filename or "upload.csv",
        account_id=account_id,
        mapping_override=mapping_dict,
    )
    return result


@router.get("/accounts")
async def list_accounts(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Account).where(Account.is_active == True))
    return result.scalars().all()
