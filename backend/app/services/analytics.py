"""DuckDB-backed analytics for fast pivots and trend queries."""
import duckdb
from app.config import settings
from app.database import get_duckdb


def sync_transactions_to_duckdb(sqlite_path: str | None = None):
    """Sync SQLite transactions table into DuckDB for analytics."""
    sqlite_path = sqlite_path or settings.sqlite_path
    conn = get_duckdb()
    conn.execute(f"""
        INSTALL sqlite; LOAD sqlite;
        CREATE OR REPLACE VIEW transactions_view AS
            SELECT
                t.id, t.account_id, t.date, t.description, t.amount,
                t.category_id, t.review_status, t.is_transfer,
                a.name as account_name, a.type as account_type,
                c.name as category_name
            FROM sqlite_scan('{sqlite_path}', 'transactions') t
            LEFT JOIN sqlite_scan('{sqlite_path}', 'accounts') a ON t.account_id = a.id
            LEFT JOIN sqlite_scan('{sqlite_path}', 'categories') c ON t.category_id = c.id
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
    filters = [
        f"date >= '{date_from}'",
        f"date <= '{date_to}'",
        "amount < 0",
        "review_status != 'rejected'",
    ]
    if account_ids:
        ids = ",".join(str(i) for i in account_ids)
        filters.append(f"account_id IN ({ids})")
    if category_ids:
        ids = ",".join(str(i) for i in category_ids)
        filters.append(f"category_id IN ({ids})")

    where = " AND ".join(filters)
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
        """).fetchall()
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
    acct_filter = ""
    if account_ids:
        ids = ",".join(str(i) for i in account_ids)
        acct_filter = f"AND account_id IN ({ids})"
    try:
        result = conn.execute(f"""
            SELECT
                strftime(date, '%Y-%m') as month,
                SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as income,
                SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END) as expenses
            FROM transactions_view
            WHERE date >= (CURRENT_DATE - INTERVAL '{months} months')
                AND review_status != 'rejected'
                {acct_filter}
            GROUP BY month
            ORDER BY month ASC
        """).fetchall()
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
    filters = [
        f"date >= '{date_from}'",
        f"date <= '{date_to}'",
        "review_status != 'rejected'",
    ]
    if account_ids:
        ids = ",".join(str(i) for i in account_ids)
        filters.append(f"account_id IN ({ids})")
    if category_ids:
        ids = ",".join(str(i) for i in category_ids)
        filters.append(f"category_id IN ({ids})")

    where = " AND ".join(filters)

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
        """).fetchall()
        return [
            {"group": r[0], "expenses": r[1], "income": r[2], "net": r[3], "count": r[4]}
            for r in result
        ]
    except Exception:
        return []
    finally:
        conn.close()
