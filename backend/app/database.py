from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
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


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
