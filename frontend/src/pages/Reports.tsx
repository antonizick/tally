import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend,
} from 'recharts'
import { reportsApi, categoriesApi } from '@/lib/api'
import { formatCurrency, formatMonth, getFirstLastOfMonth } from '@/lib/utils'

interface PivotRow {
  group: string
  expenses: number
  income: number
  net: number
  count: number
}

export default function Reports() {
  const prev3 = getFirstLastOfMonth(-3)
  const curr = getFirstLastOfMonth(0)
  const [dateFrom, setDateFrom] = useState(prev3.start)
  const [dateTo, setDateTo] = useState(curr.end)
  const [groupBy, setGroupBy] = useState('category')

  const { data: trendData = [] } = useQuery({
    queryKey: ['monthly-trend'],
    queryFn: () => reportsApi.monthlyTrend({ months: 12 }),
  })

  const { data: pivotData = [], isLoading: pivotLoading } = useQuery({
    queryKey: ['pivot', dateFrom, dateTo, groupBy],
    queryFn: () => reportsApi.pivot({ date_from: dateFrom, date_to: dateTo, group_by: groupBy }),
  })

  const trend = (trendData as Array<{ month: string; income: number; expenses: number }>)
    .map(d => ({ ...d, month: formatMonth(d.month), expenses: Math.abs(d.expenses) }))

  const pivot: PivotRow[] = pivotData

  const exportCsv = () => {
    const rows = [
      ['Group', 'Expenses', 'Income', 'Net', 'Count'],
      ...pivot.map(r => [r.group, r.expenses, r.income, r.net, r.count]),
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tally-pivot-${dateFrom}-${dateTo}.csv`
    a.click()
  }

  return (
    <div className="space-y-6">
      {/* Monthly trend */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold mb-4">12-Month Income vs. Expenses</h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={v => formatCurrency(v, true)} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(val: number, name: string) => [formatCurrency(val), name]}
              contentStyle={{ backgroundColor: 'hsl(222 47% 14%)', border: '1px solid hsl(217 33% 22%)', borderRadius: 8 }}
            />
            <Legend />
            <Line type="monotone" dataKey="income" stroke="#22c55e" strokeWidth={2} dot={false} name="Income" />
            <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} dot={false} name="Expenses" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Pivot explorer */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex flex-wrap items-end gap-4 mb-5">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="bg-input border border-border rounded px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="bg-input border border-border rounded px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Group by</label>
            <select value={groupBy} onChange={e => setGroupBy(e.target.value)}
              className="bg-input border border-border rounded px-3 py-1.5 text-sm">
              <option value="category">Category</option>
              <option value="account">Account</option>
              <option value="month">Month</option>
              <option value="week">Week</option>
            </select>
          </div>
          <button onClick={exportCsv} className="px-4 py-1.5 bg-secondary text-sm rounded hover:bg-accent transition-colors ml-auto">
            Export CSV
          </button>
        </div>

        {/* Bar chart */}
        {pivot.length > 0 && (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={pivot.slice(0, 15)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tickFormatter={v => formatCurrency(Math.abs(v), true)} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="group" tick={{ fontSize: 11 }} width={120} />
              <Tooltip
                formatter={(val: number) => formatCurrency(Math.abs(val))}
                contentStyle={{ backgroundColor: 'hsl(222 47% 14%)', border: '1px solid hsl(217 33% 22%)', borderRadius: 8 }}
              />
              <Bar dataKey="expenses" fill="#ef4444" name="Expenses" radius={[0, 3, 3, 0]} />
              <Bar dataKey="income" fill="#22c55e" name="Income" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}

        {/* Pivot table */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-3 text-xs text-muted-foreground uppercase tracking-wider">
                  {groupBy.charAt(0).toUpperCase() + groupBy.slice(1)}
                </th>
                <th className="text-right py-2 px-3 text-xs text-muted-foreground uppercase tracking-wider">Expenses</th>
                <th className="text-right py-2 px-3 text-xs text-muted-foreground uppercase tracking-wider">Income</th>
                <th className="text-right py-2 px-3 text-xs text-muted-foreground uppercase tracking-wider">Net</th>
                <th className="text-right py-2 px-3 text-xs text-muted-foreground uppercase tracking-wider">Tx</th>
              </tr>
            </thead>
            <tbody>
              {pivotLoading ? (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Loading…</td></tr>
              ) : pivot.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No data</td></tr>
              ) : (
                pivot.map((row, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-accent/20">
                    <td className="py-2.5 px-3 font-medium">{row.group}</td>
                    <td className="py-2.5 px-3 text-right text-rose-400">{formatCurrency(Math.abs(row.expenses))}</td>
                    <td className="py-2.5 px-3 text-right text-emerald-400">{formatCurrency(row.income)}</td>
                    <td className={`py-2.5 px-3 text-right font-semibold ${row.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatCurrency(row.net)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-muted-foreground">{row.count}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
