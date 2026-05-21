import asyncio
import hashlib
import json
import sqlite3
import tarfile
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings

MAX_BACKUPS = 10

EXPORT_TABLE_ORDER = [
    "accounts",
    "categories",
    "tags",
    "schema_mappings",
    "import_batches",
    "transactions",
    "transaction_tags",
    "correction_history",
    "monthly_snapshots",
    "snapshot_items",
    "checklist_statuses",
    "checklist_templates",
    "checklist_entries",
    "net_worth_views",
    "recurring_bills",
    "settings",
    "stock_holdings",
    "stock_price_history",
]


async def create_backup(db: AsyncSession, label: str | None = None) -> dict:
    ts = datetime.now(timezone.utc)
    filename = f"tally_backup_{ts.strftime('%Y%m%d_%H%M%S')}.tar.gz"
    dest = Path(settings.backups_dir) / filename

    table_data: dict[str, list[dict]] = {}
    for table in EXPORT_TABLE_ORDER:
        result = await db.execute(text(f"SELECT * FROM {table}"))
        cols = result.keys()
        rows = []
        for row in result.fetchall():
            d = {}
            for k, v in zip(cols, row):
                if isinstance(v, bytes):
                    v = v.decode("utf-8", errors="replace")
                d[k] = v
            rows.append(d)
        table_data[table] = rows

    sql_dump = await asyncio.to_thread(_sync_sql_dump, settings.sqlite_path)

    checksums: dict[str, str] = {}
    row_counts = {t: len(rows) for t, rows in table_data.items()}

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        json_dir = tmp_path / "json"
        sql_dir = tmp_path / "sql"
        json_dir.mkdir()
        sql_dir.mkdir()

        for table, rows in table_data.items():
            jfile = json_dir / f"{table}.json"
            jfile.write_text(json.dumps(rows, default=_json_default, indent=2))
            checksums[f"json/{table}.json"] = _checksum(jfile)

        sql_file = sql_dir / "tally_dump.sql"
        sql_file.write_text(sql_dump)
        checksums["sql/tally_dump.sql"] = _checksum(sql_file)

        manifest = {
            "version": "1",
            "app_version": "0.1.0",
            "created_at": ts.isoformat(),
            "table_row_counts": row_counts,
            "file_checksums": checksums,
        }
        manifest_file = tmp_path / "manifest.json"
        manifest_file.write_text(json.dumps(manifest, indent=2))

        with tarfile.open(dest, "w:gz") as tar:
            tar.add(manifest_file, arcname="manifest.json")
            for table in EXPORT_TABLE_ORDER:
                p = json_dir / f"{table}.json"
                tar.add(p, arcname=f"json/{table}.json")
            tar.add(sql_file, arcname="sql/tally_dump.sql")

    # Write sidecar metadata
    clean_label = (label or "").strip()
    meta_path = Path(settings.backups_dir) / f"{filename}.meta.json"
    meta_path.write_text(json.dumps({"label": clean_label, "created_at": ts.isoformat()}))

    # Prune to MAX_BACKUPS
    _prune_backups()

    stat = dest.stat()
    return {
        "filename": filename,
        "filesize_bytes": stat.st_size,
        "timestamp": ts.isoformat(),
        "label": clean_label,
    }


def _prune_backups() -> None:
    backups_dir = Path(settings.backups_dir)
    files = sorted(backups_dir.glob("tally_backup_*.tar.gz"), key=lambda f: f.stat().st_mtime)
    while len(files) > MAX_BACKUPS:
        oldest = files.pop(0)
        oldest.unlink(missing_ok=True)
        meta = backups_dir / f"{oldest.name}.meta.json"
        meta.unlink(missing_ok=True)


def _sync_sql_dump(db_path: str) -> str:
    conn = sqlite3.connect(db_path)
    try:
        return "\n".join(conn.iterdump())
    finally:
        conn.close()


def _json_default(obj):
    from datetime import date, datetime
    if isinstance(obj, (date, datetime)):
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def _checksum(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return f"sha256:{h.hexdigest()}"


async def background_backup(label: str) -> None:
    """Fire-and-forget backup for use with FastAPI BackgroundTasks."""
    try:
        from app.database import AsyncSessionLocal
        async with AsyncSessionLocal() as db:
            await create_backup(db, label=label)
    except Exception:
        pass


def list_backups() -> list[dict]:
    backups_dir = Path(settings.backups_dir)
    result = []
    for f in sorted(backups_dir.glob("tally_backup_*.tar.gz"), reverse=True):
        stat = f.stat()
        label = ""
        meta_path = backups_dir / f"{f.name}.meta.json"
        if meta_path.exists():
            try:
                meta = json.loads(meta_path.read_text())
                label = meta.get("label", "")
            except Exception:
                pass
        result.append({
            "filename": f.name,
            "filesize_bytes": stat.st_size,
            "modified_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            "label": label,
        })
    return result
