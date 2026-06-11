from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text
import duckdb
from app.config import settings


class Base(DeclarativeBase):
    pass


engine = create_async_engine(
    f"sqlite+aiosqlite:///{settings.sqlite_path}",
    echo=False,
    connect_args={"check_same_thread": False},
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


def get_duckdb() -> duckdb.DuckDBPyConnection:
    conn = duckdb.connect(settings.duckdb_path)
    return conn


_SEED_TAG_NAMES = ['Nick', 'Emma', 'Family', 'Work', 'Cat Stuff', 'Subscriptions']

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # One-time migration: add pinned column if absent
        try:
            await conn.execute(text("ALTER TABLE tags ADD COLUMN pinned BOOLEAN DEFAULT 0"))
        except Exception:
            pass  # column already exists
        # Ensure seed tags are pinned (idempotent)
        for name in _SEED_TAG_NAMES:
            await conn.execute(
                text("UPDATE tags SET pinned = 1 WHERE name = :name"),
                {"name": name},
            )
