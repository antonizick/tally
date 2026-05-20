import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useDashboardDates } from '@/store/dashboardDates'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
  LineChart, Line,
} from 'recharts'
import { Landmark, TrendingUp, TrendingDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { dashboardApi, netWorthApi, stockHoldingsApi } from '@/lib/api'
import { formatCurrency, formatDate, formatMonth, getFirstLastOfMonth } from '@/lib/utils'

const FALLBACK_COLORS = ['#3b82f6','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#f97316','#22c55e','#ef4444']
const GREEN_SHADES = ['#4ade80','#22c55e','#86efac','#16a34a','#34d399','#10b981','#bbf7d0','#059669']
const RED_SHADES   = ['#f87171','#ef4444','#fca5a5','#dc2626','#fb7185','#fda4af','#b91c1c','#e11d48']
const TOOLTIP_STYLE = { backgroundColor: 'hsl(222 47% 14%)', border: '1px solid hsl(217 33% 22%)', borderRadius: 8, color: 'hsl(210 40% 98%)' }
const TOOLTIP_LABEL_STYLE = { color: 'hsl(210 40% 98%)' }
const TOOLTIP_ITEM_STYLE  = { color: 'hsl(210 40% 98%)' }

function catColor(color: string | null | undefined, i: number) {
  return color || FALLBACK_COLORS[i % FALLBACK_COLORS.length]
}

function ChangeBadge({ current, prev }: { current: number; prev: number | null | undefined }) {
  if (prev == null || prev === 0) return null
  const pct = ((current - prev) / Math.abs(prev)) * 100
  const up = pct >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {up ? '+' : ''}{pct.toFixed(2)}%
    </span>
  )
}

type BreakdownItem = { name: string; value: number; is_asset: boolean }

function BreakdownTooltip({ items, pos }: { items: BreakdownItem[]; pos: { x: number; y: number } }) {
  const total = items.reduce((s, i) => s + (i.is_asset ? i.value : -i.value), 0)
  return (
    <div
      className="fixed z-50 pointer-events-none w-64 border border-border rounded-xl shadow-2xl p-3"
      style={{ left: pos.x + 14, top: pos.y + 14, backgroundColor: 'hsl(222 47% 14%)' }}
    >
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-center justify-between gap-3 text-xs">
            <span className="text-muted-foreground truncate">{item.name}</span>
            <span className={`shrink-0 font-medium ${item.is_asset ? 'text-emerald-400' : 'text-rose-400'}`}>
              {formatCurrency(item.value)}
            </span>
          </div>
        ))}
      </div>
      {items.length > 1 && (
        <div className="flex items-center justify-between gap-3 text-xs mt-2 pt-2 border-t border-border">
          <span className="text-muted-foreground font-medium">Total</span>
          <span className={`shrink-0 font-bold ${total >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {formatCurrency(total)}
          </span>
        </div>
      )}
    </div>
  )
}

function DetailLineTooltip({ active, payload, label, position }: any) {
  if (!active || !payload || !payload.length) return null

  const items = payload.filter((p: any) => !p.dataKey.startsWith('_prev_'))
  if (items.length === 0) return null

  // Calculate changes for each item
  const changes = items.map((item: any) => {
    const current = item.value
    const prev = item.payload[`_prev_${item.dataKey}`]
    const change = prev != null && prev !== 0 ? current - prev : null
    return { ...item, change, prev }
  }).sort((a: any, b: any) => {
    const aChange = a.change ?? 0
    const bChange = b.change ?? 0
    return Math.abs(bChange) - Math.abs(aChange)
  })

  const maxGainItem = changes.find((c: any) => c.change != null && c.change > 0)
  const maxLossItem = changes.find((c: any) => c.change != null && c.change < 0)

  const posX = position?.x ?? 0
  const posY = position?.y ?? 0

  return (
    <div
      className="fixed z-50 pointer-events-none w-80 border border-border rounded-xl shadow-2xl p-3"
      style={{
        backgroundColor: 'hsl(222 47% 14%)',
        left: `${posX + 10}px`,
        top: `${posY - 10}px`,
      }}
    >
      <p className="text-xs text-muted-foreground font-medium mb-2">{label}</p>
      <div className="space-y-1">
        {changes.map((item: any) => {
          const current = item.value
          const change = item.change
          const isBoldGain = change != null && maxGainItem && item.dataKey === maxGainItem.dataKey
          const isBoldLoss = change != null && maxLossItem && item.dataKey === maxLossItem.dataKey
          const isBold = isBoldGain || isBoldLoss
          const isUp = change != null && change > 0
          const isDown = change != null && change < 0

          return (
            <div key={item.dataKey} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-muted-foreground truncate">{item.dataKey}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className={isBold ? 'font-bold' : 'font-medium'}>
                  {formatCurrency(current)}
                </span>
                {change != null && (
                  <span className={`text-xs ${isBold ? 'font-bold' : 'font-medium'} ${isUp ? 'text-emerald-400' : isDown ? 'text-rose-400' : 'text-muted-foreground'}`}>
                    {isUp ? '+' : ''}{formatCurrency(change)}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StatCard({ label, value, rawValue, prevValue, sub, color, items }: {
  label: string; value: string; rawValue?: number; prevValue?: number | null
  sub?: string; color?: string; items?: BreakdownItem[]
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  return (
    <div
      className="bg-card border border-border rounded-xl p-5"
      onMouseMove={e => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setPos(null)}
    >
      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color || ''}`}>{value}</p>
      <div className="flex items-center gap-2 mt-1">
        {rawValue != null && <ChangeBadge current={rawValue} prev={prevValue} />}
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
      {pos && items && items.length > 0 && <BreakdownTooltip items={items} pos={pos} />}
    </div>
  )
}

function NetWorthCard({ name, value, prevValue, items }: {
  name: string; value: number; prevValue?: number | null; items?: BreakdownItem[]
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  return (
    <div
      className="bg-card border border-border rounded-xl p-4 flex flex-col gap-1 min-w-[200px] cursor-default"
      onMouseMove={e => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setPos(null)}
    >
      <p className="text-xs text-muted-foreground leading-snug">{name}</p>
      <p className={`text-xl font-bold ${value >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
        {formatCurrency(value)}
      </p>
      <ChangeBadge current={value} prev={prevValue} />
      {pos && items && items.length > 0 && <BreakdownTooltip items={items} pos={pos} />}
    </div>
  )
}

export default function Dashboard() {
  const { dateFrom, dateTo, setDateFrom, setDateTo } = useDashboardDates()
  const [showQuiet, setShowQuiet] = useState(false)

  const handleDateFromChange = (value: string) => {
    setDateFrom(value)
    if (value) {
      const d = new Date(value + 'T00:00:00')
      if (d.getDate() === 1) {
        const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0)
        setDateTo(lastDay.toISOString().slice(0, 10))
      }
    }
  }

  const shiftMonth = (delta: number) => {
    const base = dateFrom ? new Date(dateFrom + 'T00:00:00') : new Date()
    base.setDate(1)
    base.setMonth(base.getMonth() + delta)
    const first = new Date(base.getFullYear(), base.getMonth(), 1)
    const last  = new Date(base.getFullYear(), base.getMonth() + 1, 0)
    setDateFrom(first.toISOString().slice(0, 10))
    setDateTo(last.toISOString().slice(0, 10))
  }

  // Dashboard summary is date-range constrained
  const { data: summary, isLoading } = useQuery({
    queryKey: ['dashboard', 'summary', dateFrom, dateTo, showQuiet],
    queryFn: () => dashboardApi.summary({ date_from: dateFrom, date_to: dateTo, show_quiet: showQuiet }),
  })

  // Trend is always all-time — not constrained by date pickers
  const { data: trend = [] } = useQuery({
    queryKey: ['net-worth-trend'],
    queryFn: () => netWorthApi.trend(),
  })

  const { data: detailTrend = [] } = useQuery({
    queryKey: ['net-worth-detail-trend'],
    queryFn: () => netWorthApi.detailTrend(),
  })

  const { data: portfolioTrend, isLoading: portfolioLoading } = useQuery({
    queryKey: ['portfolio-trend'],
    queryFn: () => stockHoldingsApi.portfolioTrend(),
    staleTime: 1000 * 60 * 60, // treat as fresh for 1 hour
  })

  const trendData = (trend as Array<{ date: string; assets: number; liabilities: number; net_worth: number }>).map(d => ({
    ...d,
    month: formatMonth(d.date),
  }))

  type DetailItem = { name: string; value: number; is_asset: boolean }
  type DetailSnap = { date: string; items: DetailItem[] }
  const detailSnaps = detailTrend as DetailSnap[]

  // Collect unique names in order of first appearance, split by asset/liability
  const _aSeen = new Set<string>(), _lSeen = new Set<string>()
  const detailAssetNames: string[] = [], detailLiabNames: string[] = []
  for (const snap of detailSnaps) {
    for (const item of snap.items) {
      if (item.is_asset && !_aSeen.has(item.name)) { _aSeen.add(item.name); detailAssetNames.push(item.name) }
      if (!item.is_asset && !_lSeen.has(item.name)) { _lSeen.add(item.name); detailLiabNames.push(item.name) }
    }
  }

  const detailLineData = detailSnaps.map((snap, index) => {
    const row: Record<string, number | string | Record<string, number | string>> = { month: formatMonth(snap.date) }
    const prevSnap = index > 0 ? detailSnaps[index - 1] : null
    const prevMap = prevSnap ? Object.fromEntries(prevSnap.items.map(i => [i.name, i.value])) : {}
    for (const item of snap.items) {
      row[item.name] = item.value
      row[`_prev_${item.name}`] = prevMap[item.name] ?? null
    }
    return row
  })

  const assetColorMap = Object.fromEntries(detailAssetNames.map((n, i) => [n, GREEN_SHADES[i % GREEN_SHADES.length]]))
  const liabColorMap  = Object.fromEntries(detailLiabNames.map((n, i) => [n, RED_SHADES[i % RED_SHADES.length]]))
  const latestDetailSnap = detailSnaps[detailSnaps.length - 1]
  const detailPieData = (latestDetailSnap?.items || []).map(item => ({
    name: item.name,
    value: item.value,
    color: item.is_asset ? (assetColorMap[item.name] || GREEN_SHADES[0]) : (liabColorMap[item.name] || RED_SHADES[0]),
  }))

  const navigate = useNavigate()

  type PortfolioHolding = {
    ticker: string; name: string | null; quantity: number
    current_price: number; prev_week_price: number | null
    market_value: number; change_pct: number; direction: 'up' | 'down'
  }
  type WeeklyTotal = { week: string; total_value: number; [ticker: string]: number | string }
  const portfolioHoldings: PortfolioHolding[] = portfolioTrend?.holdings ?? []
  const weeklyTotals: WeeklyTotal[] = portfolioTrend?.weekly_totals ?? []
  const totalMarketValue: number = portfolioTrend?.total_market_value ?? 0
  const hasPortfolio = portfolioHoldings.length > 0 || portfolioLoading
  const portfolioTickers = portfolioHoldings.map(h => h.ticker)
  const STOCK_COLORS = ['#a78bfa','#38bdf8','#fb923c','#f472b6','#34d399','#facc15','#e879f9','#60a5fa']

  type TopCat = { id: number; name: string; color: string | null; parent_name: string | null; total: number; count: number }
  const topCats: TopCat[] = summary?.top_categories || []

  // Pie chart needs positive values — expenses are stored as negatives
  const pieData = topCats.map(c => ({ ...c, abs_total: Math.abs(c.total) }))

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Loading dashboard…
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* Date range pickers */}
      <div className="bg-card border border-border rounded-xl px-5 py-4 flex flex-wrap gap-4 items-end">
        <button
          onClick={() => shiftMonth(-1)}
          className="flex items-center justify-center w-8 h-8 rounded-lg bg-secondary hover:bg-accent transition-colors self-end mb-0.5"
          title="Previous month"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => handleDateFromChange(e.target.value)}
            className="bg-input border border-border rounded px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="bg-input border border-border rounded px-3 py-1.5 text-sm"
          />
        </div>
        <button
          onClick={() => shiftMonth(1)}
          className="flex items-center justify-center w-8 h-8 rounded-lg bg-secondary hover:bg-accent transition-colors self-end mb-0.5"
          title="Next month"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <label className="ml-auto flex items-center gap-2 cursor-pointer select-none pb-0.5">
          <input
            type="checkbox"
            checked={showQuiet}
            onChange={e => setShowQuiet(e.target.checked)}
            className="w-4 h-4 accent-primary"
          />
          <span className="text-sm text-muted-foreground">Show Quiet</span>
        </label>
      </div>


      {/* Net Worth Views — constrained to snapshot on/before dateTo */}
      {summary?.net_worth_views?.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Net Worth Views
            {summary?.latest_snapshot_date && (
              <span className="ml-2 normal-case font-normal text-muted-foreground/60">
                — snapshot as of {formatDate(summary.latest_snapshot_date)}
              </span>
            )}
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {summary.net_worth_views.map((v: { id: number; name: string; value: number; prev_value: number | null; items: BreakdownItem[] }) => (
              <NetWorthCard key={v.id} name={v.name} value={v.value} prevValue={v.prev_value} items={v.items} />
            ))}
          </div>
        </section>
      )}

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="Total Assets"
          value={formatCurrency(summary?.total_assets || 0)}
          rawValue={summary?.total_assets}
          prevValue={summary?.prev_total_assets}
          color="text-emerald-400"
          sub={summary?.latest_snapshot_date ? `as of ${formatDate(summary.latest_snapshot_date)}` : 'No snapshot yet'}
          items={summary?.asset_items}
        />
        <StatCard
          label="Total Liabilities"
          value={formatCurrency(summary?.total_liabilities || 0)}
          rawValue={summary?.total_liabilities}
          prevValue={summary?.prev_total_liabilities}
          color="text-rose-400"
          sub={summary?.latest_snapshot_date ? `as of ${formatDate(summary.latest_snapshot_date)}` : undefined}
          items={summary?.liability_items}
        />
        <StatCard
          label="Period Income"
          value={formatCurrency(Math.abs(summary?.period_income || 0))}
          color="text-emerald-400"
          sub={`${formatDate(dateFrom)} – ${formatDate(dateTo)}`}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Assets & Liabilities Trend — always all-time, not date-picker constrained */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-4">Assets &amp; Liabilities Trend</h3>
          {trendData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
              <div className="text-center">
                <Landmark className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No snapshots yet.</p>
                <p className="text-xs mt-1">Add a monthly snapshot in Assets &amp; Liabilities.</p>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="colorAssets" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorLiabilities" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ec4899" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => formatCurrency(v, true)} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(val: number, name: string) => [formatCurrency(val), name]}
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={TOOLTIP_LABEL_STYLE}
                  itemStyle={TOOLTIP_ITEM_STYLE}
                />
                <Area type="monotone" dataKey="assets" stroke="#3b82f6" fill="url(#colorAssets)" name="Assets" strokeWidth={2} />
                <Area type="monotone" dataKey="liabilities" stroke="#ec4899" fill="url(#colorLiabilities)" name="Liabilities" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top Spending pie — constrained by date pickers */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-4">Top Spending</h3>
          {pieData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
              No transactions yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="abs_total"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={75}
                  innerRadius={40}
                >
                  {pieData.map((cat, i) => (
                    <Cell key={cat.name} fill={catColor(cat.color, i)} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val: number, name: string) => [formatCurrency(val), name]}
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={TOOLTIP_LABEL_STYLE}
                  itemStyle={TOOLTIP_ITEM_STYLE}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(val) => <span className="text-xs text-muted-foreground">{val}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Individual asset & liability trends + composition */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Per-item trend lines */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-4">Individual Asset &amp; Liability Trends</h3>
          {detailLineData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
              <div className="text-center">
                <Landmark className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No snapshots yet.</p>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={detailLineData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => formatCurrency(v, true)} tick={{ fontSize: 11 }} />
                <Tooltip content={<DetailLineTooltip />} />
                {detailAssetNames.map((name, i) => (
                  <Line key={name} type="monotone" dataKey={name} stroke={GREEN_SHADES[i % GREEN_SHADES.length]} strokeWidth={1.5} dot={false} name={name} />
                ))}
                {detailLiabNames.map((name, i) => (
                  <Line key={name} type="monotone" dataKey={name} stroke={RED_SHADES[i % RED_SHADES.length]} strokeWidth={1.5} dot={false} name={name} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Asset & liability composition pie */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-4">Asset &amp; Liability Composition</h3>
          {detailPieData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
              No snapshots yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={detailPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} innerRadius={40}>
                  {detailPieData.map((item) => (
                    <Cell key={item.name} fill={item.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(val: number, name: string) => [formatCurrency(val), name]} contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
                <Legend iconType="circle" iconSize={8} formatter={(val) => <span className="text-xs text-muted-foreground">{val}</span>} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Stock & ETF Portfolio */}
      {hasPortfolio && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Weekly portfolio value trend */}
          <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
            <h3 className="font-semibold mb-4">Stock &amp; ETF Portfolio — Weekly Value</h3>
            {portfolioLoading ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                Fetching prices…
              </div>
            ) : weeklyTotals.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                No price data yet. Add holdings in Settings.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={weeklyTotals}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="week"
                    tick={{ fontSize: 11 }}
                    tickFormatter={w => {
                      const d = new Date(w + 'T00:00:00')
                      return `${d.toLocaleString('default', { month: 'short' })} ${d.getDate()}`
                    }}
                  />
                  <YAxis tickFormatter={v => formatCurrency(v, true)} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(val: number, name: string) => [formatCurrency(val), name]}
                    labelFormatter={w => {
                      const d = new Date(w + 'T00:00:00')
                      return `Week of ${d.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' })}`
                    }}
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    itemStyle={TOOLTIP_ITEM_STYLE}
                  />
                  <Legend iconType="circle" iconSize={8} formatter={val => <span className="text-xs text-muted-foreground">{val}</span>} />
                  <Line
                    type="monotone"
                    dataKey="total_value"
                    stroke="#ffffff"
                    strokeWidth={2}
                    strokeDasharray="4 2"
                    dot={false}
                    name="Total"
                  />
                  {portfolioTickers.map((ticker, i) => (
                    <Line
                      key={ticker}
                      type="monotone"
                      dataKey={ticker}
                      stroke={STOCK_COLORS[i % STOCK_COLORS.length]}
                      strokeWidth={1.5}
                      dot={false}
                      name={ticker}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Holdings tile */}
          <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Holdings</h3>
              <span className="text-xs text-muted-foreground">vs prev week</span>
            </div>

            {portfolioLoading ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                Loading…
              </div>
            ) : portfolioHoldings.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                No holdings
              </div>
            ) : (
              <>
                <div className="divide-y divide-border flex-1">
                  {portfolioHoldings.map(h => (
                    <div key={h.ticker} className="py-2.5 flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold font-mono">{h.ticker}</span>
                          {h.direction === 'up' ? (
                            <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          ) : (
                            <TrendingDown className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          )}
                          <span className={`text-xs font-medium ${h.direction === 'up' ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {h.change_pct >= 0 ? '+' : ''}{h.change_pct.toFixed(2)}%
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {h.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })} shares
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-bold ${h.direction === 'up' ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {formatCurrency(h.market_value)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          @{formatCurrency(h.current_price)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-border flex items-center justify-between">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Total</span>
                  <span className="text-base font-bold text-violet-400">{formatCurrency(totalMarketValue)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Spending breakdown table — constrained by date pickers */}
      {topCats.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-4">
            Spending Breakdown — {formatDate(dateFrom)} – {formatDate(dateTo)}
          </h3>
          <div className="space-y-2">
            {topCats.map((cat, i) => {
              const max = Math.abs(topCats[0]?.total || 1)
              const pct = (Math.abs(cat.total) / max) * 100
              const color = catColor(cat.color, i)
              return (
                <button
                  key={cat.name}
                  onClick={() => navigate(`/transactions?date_from=${dateFrom}&date_to=${dateTo}&category_id=${cat.id}`)}
                  className="w-full flex items-center gap-3 hover:bg-accent/30 rounded-lg px-2 py-1 -mx-2 transition-colors cursor-pointer"
                  title={`View ${cat.name} transactions`}
                >
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <div className="flex flex-col w-36 min-w-0">
                    <span className="text-sm truncate text-left leading-tight">{cat.name}</span>
                    {cat.parent_name && (
                      <span className="text-xs text-muted-foreground truncate text-left leading-tight">{cat.parent_name}</span>
                    )}
                  </div>
                  <div className="flex-1 bg-muted rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                  </div>
                  <span className="text-sm font-medium text-rose-400 w-24 text-right">
                    {formatCurrency(Math.abs(cat.total))}
                  </span>
                  <span className="text-xs text-muted-foreground w-16 text-right">
                    {cat.count} tx
                  </span>
                </button>
              )
            })}
          </div>
          <div className="flex items-center justify-end gap-3 mt-3 pt-3 border-t border-border">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Total</span>
            <span className="text-sm font-bold text-rose-400 w-24 text-right">
              {formatCurrency(topCats.reduce((sum, c) => sum + Math.abs(c.total), 0))}
            </span>
            <span className="text-xs text-muted-foreground w-16 text-right">
              {topCats.reduce((sum, c) => sum + c.count, 0)} tx
            </span>
          </div>
        </div>
      )}

    </div>
  )
}
