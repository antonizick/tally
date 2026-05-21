import hashlib
import json
from datetime import date
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Account,
    Category,
    Tag,
    NetWorthView,
    MonthlySnapshot,
    SnapshotItem,
    Transaction,
    StockHolding,
)

DELETE_ORDER = [
    "correction_history",
    "transaction_tags",
    "transactions",
    "import_batches",
    "recurring_bills",
    "schema_mappings",
    "checklist_entries",
    "snapshot_items",
    "monthly_snapshots",
    "stock_price_history",
    "stock_holdings",
    "net_worth_views",
    "checklist_templates",
    "checklist_statuses",
    "tags",
    "categories",
    "accounts",
    "settings",
]

SEED_CATEGORIES = [
    ("Income", None, "#22c55e", "dollar-sign"),
    ("Housing", None, "#3b82f6", "home"),
    ("Food", None, "#f59e0b", "utensils"),
    ("Transportation", None, "#8b5cf6", "car"),
    ("Healthcare", None, "#ec4899", "heart"),
    ("Entertainment", None, "#06b6d4", "film"),
    ("Shopping", None, "#f97316", "shopping-bag"),
    ("Utilities", None, "#6366f1", "zap"),
    ("Insurance", None, "#84cc16", "shield"),
    ("Education", None, "#14b8a6", "book"),
    ("Personal Care", None, "#f43f5e", "user"),
    ("Savings & Investments", None, "#10b981", "trending-up"),
    ("Debt Payments", None, "#ef4444", "credit-card"),
    ("Transfers", None, "#94a3b8", "repeat"),
    ("Uncategorized", None, "#6b7280", "help-circle"),
]

SEED_SUBCATEGORIES = {
    "Income": [
        ("Salary", "#22c55e"),
        ("Freelance", "#22c55e"),
        ("Dividends", "#22c55e"),
        ("Rental Income", "#22c55e"),
        ("Other Income", "#22c55e"),
    ],
    "Housing": [
        ("Rent/Mortgage", "#3b82f6"),
        ("HOA Fees", "#3b82f6"),
        ("Home Maintenance", "#3b82f6"),
        ("Home Improvement", "#3b82f6"),
    ],
    "Food": [
        ("Groceries", "#f59e0b"),
        ("Dining Out", "#f59e0b"),
        ("Coffee & Tea", "#f59e0b"),
        ("Fast Food", "#f59e0b"),
        ("Alcohol", "#f59e0b"),
    ],
    "Transportation": [
        ("Gas", "#8b5cf6"),
        ("Car Maintenance", "#8b5cf6"),
        ("Car Payment", "#8b5cf6"),
        ("Public Transit", "#8b5cf6"),
        ("Parking", "#8b5cf6"),
        ("Rideshare", "#8b5cf6"),
    ],
    "Healthcare": [
        ("Doctor", "#ec4899"),
        ("Dentist", "#ec4899"),
        ("Pharmacy", "#ec4899"),
        ("Vision", "#ec4899"),
        ("Mental Health", "#ec4899"),
    ],
    "Entertainment": [
        ("Streaming", "#06b6d4"),
        ("Games", "#06b6d4"),
        ("Movies", "#06b6d4"),
        ("Sports", "#06b6d4"),
        ("Hobbies", "#06b6d4"),
    ],
    "Shopping": [
        ("Clothing", "#f97316"),
        ("Electronics", "#f97316"),
        ("Household", "#f97316"),
        ("Amazon", "#f97316"),
        ("Other Shopping", "#f97316"),
    ],
    "Utilities": [
        ("Electric", "#6366f1"),
        ("Gas/Heating", "#6366f1"),
        ("Water", "#6366f1"),
        ("Internet", "#6366f1"),
        ("Phone", "#6366f1"),
        ("Trash", "#6366f1"),
    ],
}

SEED_TAGS = [
    ("Nick", "person"),
    ("Emma", "person"),
    ("Family", "custom"),
    ("Work", "project"),
    ("Cat Stuff", "custom"),
    ("Subscriptions", "custom"),
]

DEFAULT_NET_WORTH_VIEWS = [
    {
        "name": "Total Net Worth",
        "definition": {
            "include_types": ["all"],
            "exclude_types": [],
            "include_account_ids": [],
            "exclude_account_ids": [],
            "exclude_liabilities": False,
        },
    },
    {
        "name": "Net Worth (excluding home & mortgage)",
        "definition": {
            "include_types": [
                "checking",
                "savings",
                "brokerage",
                "retirement_401k",
                "retirement_ira",
                "vehicle",
                "other_asset",
                "credit_card",
                "loan",
                "other_liability",
            ],
            "exclude_types": [],
            "include_account_ids": [],
            "exclude_account_ids": [],
            "exclude_liabilities": False,
        },
    },
    {
        "name": "Liquid Assets",
        "definition": {
            "include_types": [
                "checking",
                "savings",
                "brokerage",
                "retirement_401k",
                "retirement_ira",
            ],
            "exclude_types": [],
            "include_account_ids": [],
            "exclude_account_ids": [],
            "exclude_liabilities": True,
        },
    },
    {
        "name": "Real Estate",
        "definition": {
            "include_types": ["home"],
            "exclude_types": [],
            "include_account_ids": [],
            "exclude_account_ids": [],
            "exclude_liabilities": True,
        },
    },
    {
        "name": "Retirement Accounts",
        "definition": {
            "include_types": ["retirement_401k", "retirement_ira"],
            "exclude_types": [],
            "include_account_ids": [],
            "exclude_account_ids": [],
            "exclude_liabilities": True,
        },
    },
    {
        "name": "Liabilities",
        "definition": {
            "include_types": [
                "credit_card",
                "loan",
                "mortgage",
                "other_liability",
            ],
            "exclude_types": [],
            "include_account_ids": [],
            "exclude_account_ids": [],
            "exclude_liabilities": False,
        },
    },
    {
        "name": "Investment Portfolio",
        "definition": {
            "include_types": ["brokerage"],
            "exclude_types": [],
            "include_account_ids": [],
            "exclude_account_ids": [],
            "exclude_liabilities": True,
        },
    },
]

SAMPLE_ACCOUNTS = [
    {"name": "Chase Checking", "type": "checking", "institution": "Chase"},
    {"name": "Ally Savings", "type": "savings", "institution": "Ally"},
    {"name": "Chase Sapphire", "type": "credit_card", "institution": "Chase"},
    {"name": "Fidelity Brokerage", "type": "brokerage", "institution": "Fidelity"},
    {"name": "Vanguard 401k", "type": "retirement_401k", "institution": "Vanguard"},
    {"name": "Primary Residence", "type": "home", "institution": None},
]

SAMPLE_STOCK_HOLDINGS = [
    ("VTI", "Vanguard Total Stock Market ETF", 1),
    ("VXUS", "Vanguard Total International Stock ETF", 1),
    ("BND", "Vanguard Total Bond Market ETF", 1),
    ("AAPL", "Apple Inc.", 1),
    ("MSFT", "Microsoft Corporation", 1),
    ("SPY", "SPDR S&P 500 ETF Trust", 1),
]

SAMPLE_ASSETS = [
    ("Chase Checking", "checking", 8500.00, "Chase Checking"),
    ("Ally Savings", "savings", 24000.00, "Ally Savings"),
    ("Fidelity Brokerage", "brokerage", 67000.00, "Fidelity Brokerage"),
    ("Vanguard 401k", "retirement_401k", 145000.00, "Vanguard 401k"),
    ("Primary Residence", "home", 420000.00, "Primary Residence"),
    ("Vehicle", "vehicle", 18500.00, None),
]

SAMPLE_LIABILITIES = [
    ("Chase Sapphire", "credit_card", 2400.00, "Chase Sapphire"),
    ("Home Mortgage", "mortgage", 285000.00, None),
    ("Auto Loan", "loan", 12800.00, None),
]

SAMPLE_TRANSACTIONS = [
    ("2026-05-02", "Whole Foods Market", -127.43),
    ("2026-05-05", "Direct Deposit Paycheck", 3850.00),
    ("2026-05-08", "Netflix", -15.99),
    ("2026-05-12", "Con Edison Electric", -94.20),
    ("2026-05-16", "Shell Gas Station", -58.75),
    ("2026-05-19", "Local Cafe", -42.60),
]


async def factory_reset(db: AsyncSession) -> dict:
    async with db.begin():
        await db.execute(text("PRAGMA foreign_keys = OFF"))
        for table in DELETE_ORDER:
            await db.execute(text(f"DELETE FROM {table}"))

        await _seed_categories(db)
        await _seed_tags(db)
        await _seed_net_worth_views(db)
        await _seed_sample_data(db)

    return {"ok": True}


async def _seed_categories(db: AsyncSession) -> None:
    parent_ids = {}
    for name, _, color, icon in SEED_CATEGORIES:
        result = await db.execute(
            text(
                "INSERT INTO categories (name, parent_id, color, icon) "
                "VALUES (:name, :parent_id, :color, :icon) RETURNING id"
            ),
            {"name": name, "parent_id": None, "color": color, "icon": icon},
        )
        parent_id = result.scalar()
        parent_ids[name] = parent_id
        await db.flush()

    for parent_name, subcats in SEED_SUBCATEGORIES.items():
        parent_id = parent_ids[parent_name]
        for sub_name, color in subcats:
            await db.execute(
                text(
                    "INSERT INTO categories (name, parent_id, color) "
                    "VALUES (:name, :parent_id, :color)"
                ),
                {"name": sub_name, "parent_id": parent_id, "color": color},
            )
        await db.flush()


async def _seed_tags(db: AsyncSession) -> None:
    for name, tag_type in SEED_TAGS:
        await db.execute(
            text("INSERT INTO tags (name, type) VALUES (:name, :type)"),
            {"name": name, "type": tag_type},
        )
    await db.flush()


async def _seed_net_worth_views(db: AsyncSession) -> None:
    for idx, view in enumerate(DEFAULT_NET_WORTH_VIEWS):
        await db.execute(
            text(
                "INSERT INTO net_worth_views (name, definition, display_order, is_default, is_active) "
                "VALUES (:name, :definition, :display_order, :is_default, :is_active)"
            ),
            {
                "name": view["name"],
                "definition": view["definition"] if isinstance(view["definition"], str) else json.dumps(view["definition"]),
                "display_order": idx,
                "is_default": idx == 0,
                "is_active": True,
            },
        )
    await db.flush()


async def _seed_sample_data(db: AsyncSession) -> None:
    account_ids = {}
    for acc in SAMPLE_ACCOUNTS:
        result = await db.execute(
            text(
                "INSERT INTO accounts (name, type, institution, currency, is_active) "
                "VALUES (:name, :type, :institution, :currency, :is_active) RETURNING id"
            ),
            {
                "name": acc["name"],
                "type": acc["type"],
                "institution": acc["institution"],
                "currency": "USD",
                "is_active": True,
            },
        )
        account_ids[acc["name"]] = result.scalar()
        await db.flush()

    for ticker, name, qty in SAMPLE_STOCK_HOLDINGS:
        await db.execute(
            text(
                "INSERT INTO stock_holdings (ticker, name, quantity) "
                "VALUES (:ticker, :name, :quantity)"
            ),
            {"ticker": ticker, "name": name, "quantity": qty},
        )
    await db.flush()

    result = await db.execute(
        text(
            "INSERT INTO monthly_snapshots (effective_date, notes, is_confirmed) "
            "VALUES (:effective_date, :notes, :is_confirmed) RETURNING id"
        ),
        {
            "effective_date": date(2026, 5, 19),
            "notes": "Sample snapshot for factory reset",
            "is_confirmed": True,
        },
    )
    snapshot_id = result.scalar()
    await db.flush()

    for name, item_type, value, account_ref in SAMPLE_ASSETS:
        account_id = account_ids.get(account_ref)
        await db.execute(
            text(
                "INSERT INTO snapshot_items (snapshot_id, account_id, name, item_type, value, source, is_asset) "
                "VALUES (:snapshot_id, :account_id, :name, :item_type, :value, :source, :is_asset)"
            ),
            {
                "snapshot_id": snapshot_id,
                "account_id": account_id,
                "name": name,
                "item_type": item_type,
                "value": value,
                "source": "manual",
                "is_asset": True,
            },
        )
    await db.flush()

    for name, item_type, value, account_ref in SAMPLE_LIABILITIES:
        account_id = account_ids.get(account_ref)
        await db.execute(
            text(
                "INSERT INTO snapshot_items (snapshot_id, account_id, name, item_type, value, source, is_asset) "
                "VALUES (:snapshot_id, :account_id, :name, :item_type, :value, :source, :is_asset)"
            ),
            {
                "snapshot_id": snapshot_id,
                "account_id": account_id,
                "name": name,
                "item_type": item_type,
                "value": value,
                "source": "manual",
                "is_asset": False,
            },
        )
    await db.flush()

    checking_account_id = account_ids["Chase Checking"]
    food_result = await db.execute(
        text("SELECT id FROM categories WHERE name = 'Groceries' LIMIT 1")
    )
    groceries_id = food_result.scalar()

    for tx_date, description, amount in SAMPLE_TRANSACTIONS:
        dedup_hash = hashlib.sha256(
            f"{checking_account_id}|{tx_date}|{description}|{amount}".encode()
        ).hexdigest()

        result = await db.execute(
            text(
                "INSERT INTO transactions "
                "(account_id, date, description, amount, category_id, status, review_status, is_transfer, dedup_hash) "
                "VALUES (:account_id, :date, :description, :amount, :category_id, :status, :review_status, :is_transfer, :dedup_hash) "
                "RETURNING id"
            ),
            {
                "account_id": checking_account_id,
                "date": tx_date,
                "description": description,
                "amount": amount,
                "category_id": groceries_id if "Whole Foods" in description or "Cafe" in description else None,
                "status": "posted",
                "review_status": "approved",
                "is_transfer": False,
                "dedup_hash": dedup_hash,
            },
        )
        await db.flush()
