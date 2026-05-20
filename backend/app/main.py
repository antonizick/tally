from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import init_db
from app.config import settings
from app.routers import upload, accounts, transactions, categories, snapshots, net_worth, dashboard, reports, tags
from app.routers import display_config


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="Tally API",
    description="Local-first personal finance tracker",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router)
app.include_router(accounts.router)
app.include_router(transactions.router)
app.include_router(categories.router)
app.include_router(snapshots.router)
app.include_router(net_worth.router)
app.include_router(dashboard.router)
app.include_router(reports.router)
app.include_router(tags.router)
app.include_router(display_config.router)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}
