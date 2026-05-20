import asyncio
import hashlib
import io
import json
import shutil
import sqlite3
import tarfile
from pathlib import Path
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import engine


DELETE_ORDER = [
    "correction_history",
    "transaction_tags",
    "transactions",
    "import_batches",
    "recurring_bills",
    "schema_mappings",
    "snapshot_items",
    "monthly_snapshots",
    "stock_price_history",
    "stock_holdings",
    "net_worth_views",
    "tags",
    "categories",
    "accounts",
    "settings",
]

INSERT_ORDER = list(reversed(DELETE_ORDER))


async def restore_from_upload(db: AsyncSession, file_bytes: bytes) -> dict:
    with tarfile.open(fileobj=io.BytesIO(file_bytes), mode="r:gz") as tar:
        members = {m.name: m for m in tar.getmembers()}

        manifest_bytes = tar.extractfile(members["manifest.json"]).read()
        manifest = json.loads(manifest_bytes)

        for path_key, expected_checksum in manifest["file_checksums"].items():
            member = members.get(path_key)
            if not member:
                raise ValueError(f"Missing file in archive: {path_key}")
            data = tar.extractfile(member).read()
            actual = "sha256:" + hashlib.sha256(data).hexdigest()
            if actual != expected_checksum:
                raise ValueError(f"Checksum mismatch for {path_key}")

        has_json = any(k.startswith("json/") for k in manifest["file_checksums"])
        has_sql = "sql/tally_dump.sql" in manifest["file_checksums"]

        if has_json:
            table_data = {}
            for key in manifest["file_checksums"]:
                if key.startswith("json/"):
                    table = key.removeprefix("json/").removesuffix(".json")
                    table_data[table] = json.loads(tar.extractfile(members[key]).read())
            await _restore_from_json(db, table_data)
            method = "json"
        elif has_sql:
            sql_text = tar.extractfile(members["sql/tally_dump.sql"]).read().decode()
            await _restore_from_sql(sql_text)
            method = "sql"
        else:
            raise ValueError("Archive contains neither JSON nor SQL restore data")

    return {"ok": True, "method": method}


async def _restore_from_json(db: AsyncSession, table_data: dict) -> None:
    async with db.begin():
        await db.execute(text("PRAGMA foreign_keys = OFF"))

        for table in DELETE_ORDER:
            await db.execute(text(f"DELETE FROM {table}"))

        for table in INSERT_ORDER:
            rows = table_data.get(table, [])
            if not rows:
                continue

            for row in rows:
                serialized = {}
                for k, v in row.items():
                    if isinstance(v, (dict, list)):
                        serialized[k] = json.dumps(v)
                    else:
                        serialized[k] = v

                cols = ", ".join(serialized.keys())
                placeholders = ", ".join(f":{k}" for k in serialized.keys())
                await db.execute(
                    text(f"INSERT OR REPLACE INTO {table} ({cols}) VALUES ({placeholders})"),
                    serialized,
                )

        await db.execute(text("PRAGMA foreign_keys = ON"))


async def _restore_from_sql(sql_text: str) -> None:
    db_path = Path(settings.sqlite_path)
    backup_path = db_path.with_suffix(".db.pre_restore_backup")

    await engine.dispose()

    try:
        shutil.copy2(db_path, backup_path)
        await asyncio.to_thread(_sync_apply_sql_dump, str(db_path), sql_text)
        backup_path.unlink(missing_ok=True)
    except Exception:
        if backup_path.exists():
            shutil.copy2(backup_path, db_path)
            backup_path.unlink(missing_ok=True)
        raise


def _sync_apply_sql_dump(db_path: str, sql_text: str) -> None:
    conn = sqlite3.connect(db_path)
    try:
        conn.executescript(sql_text)
    finally:
        conn.close()
