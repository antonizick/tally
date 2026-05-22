"""DuckDB-backed analytics for fast pivots and trend queries."""
import duckdb
from pathlib import Path
from app.config import settings
from app.database import get_duckdb


def sync_transactions_to_duckdb(sqlite_path: str | None = None):
    """Sync SQLite transactions table into DuckDB for analytics.

    Validates SQLite path is within expected data directory.
    """
    sqlite_path = sqlite_path or settings.sqlite_path

    # FIX #2: Validate path to prevent directory traversal/injection
    path = Path(sqlite_path).resolve()
    base_dir = Path(settings.data_dir).resolve()

    if not str(path).startswith(str(base_dir)):
        raise ValueError(f"SQLite path outside data directory: {path}")

    if not path.exists():
        raise FileNotFoundError(f"SQLite database not found: {path}")

    conn = get_duckdb()
    # Escape path by replacing single quotes (proper SQL escaping)
    path_str = str(path).replace("'", "''")

    conn.execute(f"""
        INSTALL sqlite; LOAD sqlite;
        CREATE OR REPLACE VIEW transactions_view AS
            SELECT
                t.id, t.account_id, t.date, t.description, t.amount,
                t.category_id, t.review_status, t.is_transfer,
                a.name as account_name, a.type as account_type,
                c.name as category_name
            FROM sqlite_scan('{path_str}', 'transactions') t
            LEFT JOIN sqlite_scan('{path_str}', 'accounts') a ON t.account_id = a.id
            LEFT JOIN sqlite_scan('{path_str}', 'categories') c ON t.category_id = c.id
            WHERE t.is_transfer = 0
    """)
    conn.close()


def spending_by_category(
    date_from: str,
    date_to: str,
    account_ids: list[int] | None = None,
    category_ids: list[int] | None = None,
) -> list[dict]:
    """Returns [{category_name, total, count}] sorted by |total| desc."""
    conn = get_duckdb()

    # FIX #1: Use parameterized queries instead of f-string interpolation
    where_parts = [
        "date >= ?",
        "date <= ?",
        "amount < 0",
        "review_status != 'rejected'",
    ]
    params = [date_from, date_to]

    # Handle account_ids filter with proper parameterization
    if account_ids:
        placeholders = ",".join(["?" for _ in account_ids])
        where_parts.append(f"account_id IN ({placeholders})")
        params.extend(account_ids)

    # Handle category_ids filter with proper parameterization
    if category_ids:
        placeholders = ",".join(["?" for _ in category_ids])
        where_parts.append(f"category_id IN ({placeholders})")
        params.extend(category_ids)

    where = " AND ".join(where_parts)

    try:
        result = conn.execute(f"""
            SELECT
                COALESCE(category_name, 'Uncategorized') as category_name,
                SUM(amount) as total,
                COUNT(*) as tx_count
            FROM transactions_view
            WHERE {where}
            GROUP BY category_name
            ORDER BY total ASC
            LIMIT 20
        """, params).fetchall()
        return [{"category_name": r[0], "total": r[1], "count": r[2]} for r in result]
    except Exception:
        return []
    finally:
        conn.close()


def monthly_spending_trend(
    months: int = 12,
    account_ids: list[int] | None = None,
) -> list[dict]:
    """Returns [{month, income, expenses}] for last N months."""
    conn = get_duckdb()

    # FIX #1: Use parameterized queries and dynamic WHERE clause building
    where_parts = [
        "date >= (CURRENT_DATE - INTERVAL ? months)",
        "review_status != 'rejected'",
    ]
    params = [months]

    # Handle account_ids filter with proper parameterization
    if account_ids:
        placeholders = ",".join(["?" for _ in account_ids])
        where_parts.append(f"account_id IN ({placeholders})")
        params.extend(account_ids)

    where = " AND ".join(where_parts)

    try:
        result = conn.execute(f"""
            SELECT
                strftime(date, '%Y-%m') as month,
                SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as income,
                SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END) as expenses
            FROM transactions_view
            WHERE {where}
            GROUP BY month
            ORDER BY month ASC
        """, params).fetchall()
        return [{"month": r[0], "income": r[1], "expenses": r[2]} for r in result]
    except Exception:
        return []
    finally:
        conn.close()


def pivot_transactions(
    date_from: str,
    date_to: str,
    group_by: str = "category",
    account_ids: list[int] | None = None,
    category_ids: list[int] | None = None,
    tag_ids: list[int] | None = None,
) -> list[dict]:
    """Generic pivot endpoint for the Reports page."""
    conn = get_duckdb()

    # FIX #1: Use parameterized queries instead of f-string interpolation
    where_parts = [
        "date >= ?",
        "date <= ?",
        "review_status != 'rejected'",
    ]
    params = [date_from, date_to]

    # Handle account_ids filter with proper parameterization
    if account_ids:
        placeholders = ",".join(["?" for _ in account_ids])
        where_parts.append(f"account_id IN ({placeholders})")
        params.extend(account_ids)

    # Handle category_ids filter with proper parameterization
    if category_ids:
        placeholders = ",".join(["?" for _ in category_ids])
        where_parts.append(f"category_id IN ({placeholders})")
        params.extend(category_ids)

    where = " AND ".join(where_parts)

    # Whitelist group_by values to prevent injection
    group_col = {
        "category": "COALESCE(category_name, 'Uncategorized')",
        "account": "account_name",
        "month": "strftime(date, '%Y-%m')",
        "week": "strftime(date, '%Y-W%W')",
        "day": "CAST(date AS VARCHAR)",
    }.get(group_by, "COALESCE(category_name, 'Uncategorized')")

    try:
        result = conn.execute(f"""
            SELECT
                {group_col} as group_key,
                SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END) as expenses,
                SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as income,
                SUM(amount) as net,
                COUNT(*) as count
            FROM transactions_view
            WHERE {where}
            GROUP BY group_key
            ORDER BY expenses ASC
        """, params).fetchall()
        return [
            {"group": r[0], "expenses": r[1], "income": r[2], "net": r[3], "count": r[4]}
            for r in result
        ]
    except Exception:
        return []
    finally:
        conn.close()
