"""Check the 'accept all pending as reviewed' bulk action: it flips every
review_status='pending' row to 'approved' and leaves everything else untouched."""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import select

from app.database import Base
from app.models import Account, Transaction
from app.routers.transactions import approve_all_pending
from datetime import date


async def _run(tmp_db_path: str):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_db_path}")
    session_maker = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with session_maker() as db:
        acct = Account(name="Test Checking", type="checking")
        db.add(acct)
        await db.flush()

        rows = [
            Transaction(account_id=acct.id, date=date(2026, 7, 1), description="a", amount=-1, review_status="pending"),
            Transaction(account_id=acct.id, date=date(2026, 7, 2), description="b", amount=-2, review_status="pending"),
            Transaction(account_id=acct.id, date=date(2026, 7, 3), description="c", amount=-3, review_status="approved"),
            Transaction(account_id=acct.id, date=date(2026, 7, 4), description="d", amount=-4, review_status="overridden"),
        ]
        db.add_all(rows)
        await db.commit()

        result = await approve_all_pending(db=db)
        assert result == {"approved": 2}

        statuses = sorted((await db.execute(select(Transaction.review_status))).scalars().all())
        assert statuses == ["approved", "approved", "approved", "overridden"]

        # Idempotent: running it again with nothing pending approves zero more.
        result2 = await approve_all_pending(db=db)
        assert result2 == {"approved": 0}

    await engine.dispose()


def test_approve_all_pending(tmp_path):
    asyncio.run(_run(str(tmp_path / "test.db")))
