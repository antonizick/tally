"""Fetch weekly close prices via yfinance, cache in DB."""
from datetime import date, timedelta
import yfinance as yf
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.stock_price import StockPriceHistory
from app.models.stock_holding import StockHolding


def _week_monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


async def _get_cached_price(db: AsyncSession, ticker: str, week: date) -> float | None:
    result = await db.execute(
        select(StockPriceHistory).where(
            StockPriceHistory.ticker == ticker,
            StockPriceHistory.week_date == week,
        )
    )
    row = result.scalar_one_or_none()
    return row.close_price if row else None


async def _store_price(db: AsyncSession, ticker: str, week: date, price: float) -> None:
    existing = await db.execute(
        select(StockPriceHistory).where(
            StockPriceHistory.ticker == ticker,
            StockPriceHistory.week_date == week,
        )
    )
    row = existing.scalar_one_or_none()
    if row:
        row.close_price = price
    else:
        db.add(StockPriceHistory(ticker=ticker, week_date=week, close_price=price))


def _fetch_weekly_prices(ticker: str, weeks: int = 13) -> dict[date, float]:
    """Return {week_monday: close_price} for the last `weeks` weeks."""
    today = date.today()
    start = today - timedelta(weeks=weeks + 1)
    try:
        tk = yf.Ticker(ticker)
        hist = tk.history(start=str(start), end=str(today + timedelta(days=1)), interval="1wk")
        if hist.empty:
            return {}
        result: dict[date, float] = {}
        for ts, row in hist.iterrows():
            d = ts.date() if hasattr(ts, "date") else ts
            week = _week_monday(d)
            price = float(row["Close"])
            if price > 0:
                result[week] = price
        return result
    except Exception:
        return {}


async def get_portfolio_trend(db: AsyncSession) -> dict:
    """
    Returns:
    {
      holdings: [{ticker, name, quantity, current_price, prev_week_price,
                  market_value, change_pct, direction}],
      weekly_totals: [{week: str, total_value: float}],
      total_market_value: float,
    }
    """
    result = await db.execute(select(StockHolding).order_by(StockHolding.ticker))
    holdings = result.scalars().all()

    if not holdings:
        return {"holdings": [], "weekly_totals": [], "total_market_value": 0.0}

    today = date.today()
    this_week = _week_monday(today)
    prev_week = this_week - timedelta(weeks=1)

    # Collect all price data per ticker (fetch from network + cache)
    ticker_weekly: dict[str, dict[date, float]] = {}
    for h in holdings:
        # Check cache for current week
        cached_now = await _get_cached_price(db, h.ticker, this_week)
        if cached_now is None:
            fetched = _fetch_weekly_prices(h.ticker, weeks=13)
            for w, price in fetched.items():
                await _store_price(db, h.ticker, w, price)
            ticker_weekly[h.ticker] = fetched
        else:
            # Load all cached weeks
            rows = await db.execute(
                select(StockPriceHistory)
                .where(StockPriceHistory.ticker == h.ticker)
                .order_by(StockPriceHistory.week_date)
            )
            ticker_weekly[h.ticker] = {r.week_date: r.close_price for r in rows.scalars().all()}

    await db.commit()

    # Build per-holding summary
    holding_data = []
    for h in holdings:
        prices = ticker_weekly.get(h.ticker, {})
        sorted_weeks = sorted(prices.keys())

        current_price = prices.get(this_week) or (prices[sorted_weeks[-1]] if sorted_weeks else None)
        prev_price = prices.get(prev_week) or (prices[sorted_weeks[-2]] if len(sorted_weeks) >= 2 else None)

        if current_price is None:
            continue

        market_value = h.quantity * current_price
        if prev_price and prev_price > 0:
            change_pct = ((current_price - prev_price) / prev_price) * 100
        else:
            change_pct = 0.0
        direction = "up" if change_pct >= 0 else "down"

        holding_data.append({
            "ticker": h.ticker,
            "name": h.name,
            "quantity": h.quantity,
            "current_price": round(current_price, 4),
            "prev_week_price": round(prev_price, 4) if prev_price else None,
            "market_value": round(market_value, 2),
            "change_pct": round(change_pct, 2),
            "direction": direction,
        })

    # Aggregate weekly totals across all holdings, include per-ticker values
    all_weeks: set[date] = set()
    for prices in ticker_weekly.values():
        all_weeks.update(prices.keys())

    holding_by_ticker = {h.ticker: h for h in holdings}
    weekly_totals = []
    for week in sorted(all_weeks)[-13:]:
        total = 0.0
        row: dict = {"week": str(week)}
        for ticker, prices in ticker_weekly.items():
            price = prices.get(week)
            h = holding_by_ticker.get(ticker)
            if price and h:
                val = round(h.quantity * price, 2)
                row[ticker] = val
                total += val
        if total > 0:
            row["total_value"] = round(total, 2)
            weekly_totals.append(row)

    total_mv = sum(hd["market_value"] for hd in holding_data)

    return {
        "holdings": holding_data,
        "weekly_totals": weekly_totals,
        "total_market_value": round(total_mv, 2),
    }
