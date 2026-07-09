"""End-to-end check for the CSV import preview/commit split: date cutoff filtering,
preview writing nothing, and dedup working across separate uploads.

Uses its own throwaway SQLite engine (not the app's global one) so it never touches
real data and doesn't depend on import order.
"""
import asyncio
from datetime import date
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.database import Base
from app.models import Account, Transaction, ImportBatch
from app.services.csv_ingestion import ingest_csv
from sqlalchemy import select

MAPPING = {
    "date": "Date", "description": "Description", "amount": "Amount",
    "amount_type": "single", "date_format": "%m/%d/%Y",
}

CSV1 = b"""Date,Description,Amount
07/01/2026,COFFEE SHOP,-5.00
07/02/2026,GROCERY STORE,-40.00
06/25/2026,OLD PURCHASE,-10.00
"""

CSV2 = b"""Date,Description,Amount
07/01/2026,COFFEE SHOP,-5.00
07/02/2026,GROCERY STORE,-40.00
07/05/2026,NEW PURCHASE,-20.00
"""


async def _run(tmp_db_path: str):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_db_path}")
    session_maker = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with session_maker() as db:
        acct = Account(name="Test Checking", type="checking")
        db.add(acct)
        await db.commit()
        await db.refresh(acct)

        preview1 = await ingest_csv(
            db, CSV1, "test1.csv", acct.id,
            mapping_override=MAPPING, date_from=date(2026, 7, 1), preview=True,
        )
        assert preview1["status"] == "preview"
        assert preview1["total"] == 3
        assert preview1["after_cutoff"] == 2  # 06/25 row excluded by cutoff
        assert preview1["duplicates"] == 0
        assert preview1["imported"] == 2

        commit1 = await ingest_csv(
            db, CSV1, "test1.csv", acct.id,
            mapping_override=MAPPING, date_from=date(2026, 7, 1), preview=False,
        )
        assert commit1["status"] == "complete"
        assert commit1["imported"] == 2
        assert commit1["duplicates"] == 0

        # Overlapping second upload: the two shared rows must be caught as duplicates
        preview2 = await ingest_csv(
            db, CSV2, "test2.csv", acct.id, mapping_override=MAPPING, preview=True,
        )
        assert preview2["after_cutoff"] == 3
        assert preview2["duplicates"] == 2
        assert preview2["imported"] == 1

        commit2 = await ingest_csv(
            db, CSV2, "test2.csv", acct.id, mapping_override=MAPPING, preview=False,
        )
        assert commit2["imported"] == 1
        assert commit2["duplicates"] == 2

        txs = (await db.execute(select(Transaction))).scalars().all()
        assert len(txs) == 3

        # Preview calls must not have written anything: only the 2 committed
        # batches should exist.
        batches = (await db.execute(select(ImportBatch))).scalars().all()
        assert len(batches) == 2

    await engine.dispose()


def test_preview_cutoff_and_cross_upload_dedup(tmp_path):
    asyncio.run(_run(str(tmp_path / "test.db")))
