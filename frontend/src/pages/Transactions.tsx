import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  useReactTable, getCoreRowModel, getSortedRowModel,
  flexRender, type ColumnDef, type SortingState,
} from '@tanstack/react-table'
import { CheckCircle, ChevronDown, ChevronUp, ChevronsUpDown, Filter } from 'lucide-react'
import { transactionsApi, categoriesApi } from '@/lib/api'
import { formatCurrency, formatDate, cn, amountColor, confidenceColor, getFirstLastOfMonth } from '@/lib/utils'

interface Transaction {
  id: number
  account_id: number
  date: string
  description: string
  amount: number
  category_id: number | null
  category_name: string | null
  review_status: string
  confidence: number | null
  ai_category_suggestion: string | null
  is_transfer: boolean
  tags: Array<{ id: number; name: string; color: string | null }>
}

interface Category {
  id: number
  name: string
  parent_id: number | null
  color: string | null
  children: Category[]
}

function flatCategories(cats: Category[]): Array<{ id: number; label: string }> {
  const out: Array<{ id: number; label: string }> = []
  for (const c of cats) {
    out.push({ id: c.id, label: c.name })
    for (const child of c.children) {
      out.push({ id: child.id, label: `  ${c.name} › ${child.name}` })
    }
  }
  return out
}

export default function Transactions() {
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const { start, end } = getFirstLastOfMonth(0)
  const [dateFrom, setDateFrom] = useState(searchParams.get('date_from') || start)
  const [dateTo, setDateTo] = useState(searchParams.get('date_to') || end)
  const [categoryId, setCategoryId] = useState(searchParams.get('category_id') || '')
  const [reviewStatus, setReviewStatus] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sorting, setSorting] = useState<SortingState>([])

  const params = {
    date_from: dateFrom,
    date_to: dateTo,
    category_ids: categoryId || undefined,
    review_status: reviewStatus || undefined,
    search: search || undefined,
    page,
    page_size: 50,
  }

  const { data, isLoading } = useQuery({
    queryKey: ['transactions', params],
    queryFn: () => transactionsApi.list(params),
  })

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesApi.list(),
  })

  const flatCats = flatCategories(categories)

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: { id: number; category_id?: number; review_status?: string }) =>
      transactionsApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })

  const bulkApproveMutation = useMutation({
    mutationFn: (ids: number[]) => transactionsApi.bulkApprove(ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['review-queue-count'] })
    },
  })

  const transactions: Transaction[] = data?.items || []
  const total = data?.total || 0
  const totalPages = Math.ceil(total / 50)

  const pendingIds = transactions
    .filter(t => t.review_status === 'pending')
    .map(t => t.id)

  const columns: ColumnDef<Transaction>[] = [
    {
      accessorKey: 'date',
      header: 'Date',
      cell: ({ getValue }) => formatDate(getValue() as string),
      size: 110,
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium truncate max-w-xs">{row.original.description}</p>
          {row.original.tags.length > 0 && (
            <div className="flex gap-1 mt-0.5">
              {row.original.tags.map(t => (
                <span key={t.id} className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                  {t.name}
                </span>
              ))}
            </div>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'amount',
      header: 'Amount',
      cell: ({ getValue }) => {
        const v = getValue() as number
        return <span className={`font-mono text-sm font-semibold ${amountColor(v)}`}>{formatCurrency(v)}</span>
      },
      size: 110,
    },
    {
      id: 'category',
      header: 'Category',
      cell: ({ row }) => (
        <select
          value={row.original.category_id || ''}
          onChange={e => {
            const catId = e.target.value ? Number(e.target.value) : null
            updateMutation.mutate({ id: row.original.id, category_id: catId ?? undefined })
          }}
          className="bg-input border border-border rounded px-2 py-1 text-xs max-w-[160px]"
        >
          <option value="">Uncategorized</option>
          {flatCats.map(c => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      ),
      size: 180,
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const rs = row.original.review_status
        const conf = row.original.confidence
        return (
          <div className="flex items-center gap-2">
            <span className={cn(
              'text-xs px-2 py-0.5 rounded-full font-medium',
              rs === 'approved' ? 'bg-emerald-500/10 text-emerald-400' :
              rs === 'overridden' ? 'bg-blue-500/10 text-blue-400' :
              'bg-yellow-500/10 text-yellow-400'
            )}>
              {rs}
            </span>
            {conf !== null && rs === 'pending' && (
              <span className={`text-xs ${confidenceColor(conf)}`}>
                {Math.round(conf * 100)}%
              </span>
            )}
          </div>
        )
      },
      size: 140,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        row.original.review_status === 'pending' ? (
          <button
            onClick={() => updateMutation.mutate({ id: row.original.id, review_status: 'approved' })}
            className="text-emerald-400 hover:text-emerald-300 transition-colors"
            title="Approve"
          >
            <CheckCircle className="w-4 h-4" />
          </button>
        ) : null
      ),
      size: 40,
    },
  ]

  const table = useReactTable({
    data: transactions,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: { sorting },
    onSortingChange: setSorting,
    manualPagination: true,
  })

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">From</label>
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }}
            className="bg-input border border-border rounded px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">To</label>
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }}
            className="bg-input border border-border rounded px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Category</label>
          <select value={categoryId} onChange={e => { setCategoryId(e.target.value); setPage(1) }}
            className="bg-input border border-border rounded px-3 py-1.5 text-sm max-w-[200px]">
            <option value="">All Categories</option>
            {flatCats.map(c => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Status</label>
          <select value={reviewStatus} onChange={e => { setReviewStatus(e.target.value); setPage(1) }}
            className="bg-input border border-border rounded px-3 py-1.5 text-sm">
            <option value="">All</option>
            <option value="pending">Pending Review</option>
            <option value="approved">Approved</option>
            <option value="overridden">Overridden</option>
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-muted-foreground block mb-1">Search</label>
          <input
            type="text"
            placeholder="Search descriptions…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="w-full bg-input border border-border rounded px-3 py-1.5 text-sm"
          />
        </div>
        {pendingIds.length > 0 && (
          <button
            onClick={() => bulkApproveMutation.mutate(pendingIds)}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-emerald-500 transition-colors"
          >
            <CheckCircle className="w-4 h-4" />
            Approve All ({pendingIds.length})
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <p className="text-sm text-muted-foreground">{total.toLocaleString()} transactions</p>
          <p className="text-sm text-muted-foreground">Page {page} of {totalPages || 1}</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              {table.getHeaderGroups().map(hg => (
                <tr key={hg.id} className="border-b border-border">
                  {hg.headers.map(header => (
                    <th
                      key={header.id}
                      className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer select-none"
                      style={{ width: header.column.getSize() }}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className="flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && (
                          header.column.getIsSorted() === 'asc' ? <ChevronUp className="w-3 h-3" /> :
                          header.column.getIsSorted() === 'desc' ? <ChevronDown className="w-3 h-3" /> :
                          <ChevronsUpDown className="w-3 h-3 opacity-30" />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={columns.length} className="text-center py-12 text-muted-foreground">Loading…</td></tr>
              ) : transactions.length === 0 ? (
                <tr><td colSpan={columns.length} className="text-center py-12 text-muted-foreground">No transactions found</td></tr>
              ) : (
                table.getRowModel().rows.map(row => (
                  <tr key={row.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id} className="px-4 py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 px-5 py-3 border-t border-border">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 text-sm rounded bg-secondary hover:bg-accent disabled:opacity-40 transition-colors">
              ← Prev
            </button>
            <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
            <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 text-sm rounded bg-secondary hover:bg-accent disabled:opacity-40 transition-colors">
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
