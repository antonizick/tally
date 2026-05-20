from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from app.database import get_db
from app.models import Category, Transaction
from app.schemas import CategoryRead, CategoryCreate
from app.schemas.category import CategoryUpdate

router = APIRouter(prefix="/api/categories", tags=["categories"])

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
        ("Salary", "#22c55e"), ("Freelance", "#22c55e"), ("Dividends", "#22c55e"),
        ("Rental Income", "#22c55e"), ("Other Income", "#22c55e"),
    ],
    "Housing": [
        ("Rent/Mortgage", "#3b82f6"), ("HOA Fees", "#3b82f6"), ("Home Maintenance", "#3b82f6"),
        ("Home Improvement", "#3b82f6"),
    ],
    "Food": [
        ("Groceries", "#f59e0b"), ("Dining Out", "#f59e0b"), ("Coffee & Tea", "#f59e0b"),
        ("Fast Food", "#f59e0b"), ("Alcohol", "#f59e0b"),
    ],
    "Transportation": [
        ("Gas", "#8b5cf6"), ("Car Maintenance", "#8b5cf6"), ("Car Payment", "#8b5cf6"),
        ("Public Transit", "#8b5cf6"), ("Parking", "#8b5cf6"), ("Rideshare", "#8b5cf6"),
    ],
    "Healthcare": [
        ("Doctor", "#ec4899"), ("Dentist", "#ec4899"), ("Pharmacy", "#ec4899"),
        ("Vision", "#ec4899"), ("Mental Health", "#ec4899"),
    ],
    "Entertainment": [
        ("Streaming", "#06b6d4"), ("Games", "#06b6d4"), ("Movies", "#06b6d4"),
        ("Sports", "#06b6d4"), ("Hobbies", "#06b6d4"),
    ],
    "Shopping": [
        ("Clothing", "#f97316"), ("Electronics", "#f97316"), ("Household", "#f97316"),
        ("Amazon", "#f97316"), ("Other Shopping", "#f97316"),
    ],
    "Utilities": [
        ("Electric", "#6366f1"), ("Gas/Heating", "#6366f1"), ("Water", "#6366f1"),
        ("Internet", "#6366f1"), ("Phone", "#6366f1"), ("Trash", "#6366f1"),
    ],
}


async def _tx_counts(db: AsyncSession, date_from: str | None = None, date_to: str | None = None) -> dict[int, int]:
    """Return {category_id: transaction_count}, optionally filtered by date range."""
    filters = [Transaction.category_id.is_not(None)]
    if date_from:
        filters.append(Transaction.date >= date_from)
    if date_to:
        filters.append(Transaction.date <= date_to)
    rows = await db.execute(
        select(Transaction.category_id, func.count(Transaction.id))
        .where(and_(*filters))
        .group_by(Transaction.category_id)
    )
    return {row[0]: row[1] for row in rows.all()}


@router.get("/", response_model=list[CategoryRead])
async def list_categories(
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    counts = await _tx_counts(db, date_from, date_to)

    result = await db.execute(
        select(Category).where(Category.parent_id == None).order_by(Category.name)
    )
    parents = result.scalars().all()
    out = []
    for parent in parents:
        children_result = await db.execute(
            select(Category).where(Category.parent_id == parent.id).order_by(Category.name)
        )
        children = children_result.scalars().all()
        out.append(CategoryRead(
            id=parent.id,
            name=parent.name,
            parent_id=None,
            color=parent.color,
            icon=parent.icon,
            transaction_count=counts.get(parent.id, 0),
            children=[
                CategoryRead(
                    id=c.id,
                    name=c.name,
                    parent_id=c.parent_id,
                    color=c.color,
                    icon=c.icon,
                    transaction_count=counts.get(c.id, 0),
                )
                for c in children
            ]
        ))
    return out


@router.post("/", response_model=CategoryRead)
async def create_category(body: CategoryCreate, db: AsyncSession = Depends(get_db)):
    cat = Category(**body.model_dump())
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return CategoryRead(
        id=cat.id, name=cat.name, parent_id=cat.parent_id,
        color=cat.color, icon=cat.icon,
    )


@router.put("/{cat_id}", response_model=CategoryRead)
async def update_category(cat_id: int, body: CategoryUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Category).where(Category.id == cat_id))
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(404, "Category not found")

    if body.name is not None:
        body.name = body.name.strip()
        if not body.name:
            raise HTTPException(422, "Name cannot be empty")
        cat.name = body.name
    if body.color is not None:
        cat.color = body.color
    if body.icon is not None:
        cat.icon = body.icon
    if body.parent_id is not None:
        if body.parent_id == cat_id:
            raise HTTPException(422, "Category cannot be its own parent")
        cat.parent_id = body.parent_id

    await db.commit()
    await db.refresh(cat)
    counts = await _tx_counts(db)
    return CategoryRead(
        id=cat.id, name=cat.name, parent_id=cat.parent_id,
        color=cat.color, icon=cat.icon,
        transaction_count=counts.get(cat.id, 0),
    )


@router.delete("/{cat_id}")
async def delete_category(cat_id: int, force: bool = False, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Category).where(Category.id == cat_id))
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(404, "Category not found")

    # Check for child categories
    children = (await db.execute(
        select(func.count(Category.id)).where(Category.parent_id == cat_id)
    )).scalar_one()

    # Check for assigned transactions
    tx_count = (await db.execute(
        select(func.count(Transaction.id)).where(Transaction.category_id == cat_id)
    )).scalar_one()

    if (children > 0 or tx_count > 0) and not force:
        return {
            "ok": False,
            "blocked": True,
            "children": children,
            "transaction_count": tx_count,
            "message": f"Category has {tx_count} transaction(s) and {children} subcategory(ies). Pass force=true to delete anyway (transactions will become uncategorized).",
        }

    # Null out transactions assigned to this category
    if tx_count > 0:
        txs = (await db.execute(
            select(Transaction).where(Transaction.category_id == cat_id)
        )).scalars().all()
        for tx in txs:
            tx.category_id = None

    # Null out children's parent reference (promote to top-level)
    if children > 0:
        child_cats = (await db.execute(
            select(Category).where(Category.parent_id == cat_id)
        )).scalars().all()
        for c in child_cats:
            c.parent_id = None

    await db.delete(cat)
    await db.commit()
    return {"ok": True, "transaction_count": tx_count, "children_promoted": children}


@router.post("/seed")
async def seed_categories(db: AsyncSession = Depends(get_db)):
    existing = (await db.execute(select(Category))).scalars().all()
    if existing:
        return {"message": "Categories already exist", "count": len(existing)}

    parent_ids: dict[str, int] = {}
    for name, parent_id, color, icon in SEED_CATEGORIES:
        cat = Category(name=name, color=color, icon=icon)
        db.add(cat)
        await db.flush()
        parent_ids[name] = cat.id

    for parent_name, children in SEED_SUBCATEGORIES.items():
        parent_id = parent_ids.get(parent_name)
        if not parent_id:
            continue
        for child_name, color in children:
            cat = Category(name=child_name, parent_id=parent_id, color=color)
            db.add(cat)

    await db.commit()
    return {"message": "Categories seeded", "count": len(SEED_CATEGORIES)}
