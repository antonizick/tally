import { useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  useReactTable, getCoreRowModel, getSortedRowModel,
  flexRender, type ColumnDef, type SortingState,
} from '@tanstack/react-table'
import { CheckCircle, ChevronDown, ChevronUp, ChevronsUpDown, ChevronLeft, ChevronRight, Filter, X, Plus } from 'lucide-react'
import { transactionsApi, categoriesApi, tagsApi } from '@/lib/api'
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
  notes: string | null
  source_file: string | null
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

type TagOption = { id: number; name: string; color: string | null }

function TagsCell({
  transaction,
  allTags,
  onUpdate,
  onCreateTag,
}: {
  transaction: Transaction
  allTags: TagOption[]
  onUpdate: (id: number, tagIds: number[]) => void
  onCreateTag: (name: string) => Promise<TagOption>
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) { setSearch(''); return }
    const t = setTimeout(() => inputRef.current?.focus(), 30)
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler) }
  }, [open])

  const currentIds = transaction.tags.map(t => t.id)
  const trimmed = search.trim()
  const available = allTags.filter(
    t => !currentIds.includes(t.id) && t.name.toLowerCase().includes(trimmed.toLowerCase())
  )
  const exactExists = allTags.some(t => t.name.toLowerCase() === trimmed.toLowerCase())
  const canCreate = trimmed.length > 0 && !exactExists

  const removeTag = (tagId: number) => onUpdate(transaction.id, currentIds.filter(id => id !== tagId))
  const addTag = (tagId: number) => { onUpdate(transaction.id, [...currentIds, tagId]); setOpen(false) }

  const handleCreate = async () => {
    if (!trimmed || creating) return
    setCreating(true)
    try {
      const newTag = await onCreateTag(trimmed)
      onUpdate(transaction.id, [...currentIds, newTag.id])
      setOpen(false)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div ref={containerRef} className="flex flex-wrap gap-1 items-center relative min-w-[120px]">
      {transaction.tags.map(t => {
        const color = t.color || '#3b82f6'
        return (
          <span
            key={t.id}
            className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded"
            style={{ backgroundColor: color + '22', color, border: `1px solid ${color}55` }}
          >
            {t.name}
            <button
              onClick={() => removeTag(t.id)}
              className="ml-0.5 hover:opacity-60 transition-opacity"
              title={`Remove ${t.name}`}
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        )
      })}
      <div className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          className="w-5 h-5 rounded-full border border-dashed border-muted-foreground/40 hover:border-primary text-muted-foreground hover:text-primary flex items-center justify-center transition-colors"
          title="Add or create tag"
        >
          <Plus className="w-3 h-3" />
        </button>
        {open && (
          <div className="absolute z-50 top-6 left-0 bg-card border border-border rounded-lg shadow-xl w-52 pb-1">
            <div className="p-2">
              <input
                ref={inputRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && canCreate) handleCreate()
                  if (e.key === 'Escape') setOpen(false)
                }}
                placeholder="Search or type new…"
                className="w-full bg-input border border-border rounded px-2 py-1 text-xs"
              />
            </div>
            {available.length > 0 && (
              <div className="border-t border-border/50">
                {available.map(t => (
                  <button
                    key={t.id}
                    onClick={() => addTag(t.id)}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent flex items-center gap-2 transition-colors"
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.color || '#3b82f6' }} />
                    {t.name}
                  </button>
                ))}
              </div>
            )}
            {canCreate && (
              <div className={available.length > 0 ? 'border-t border-border/50 pt-0.5' : ''}>
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent flex items-center gap-2 transition-colors text-primary disabled:opacity-50"
                >
                  <Plus className="w-3 h-3 shrink-0" />
                  {creating ? 'Creating…' : `Create "${trimmed}"`}
                </button>
              </div>
            )}
            {available.length === 0 && !canCreate && (
              <p className="px-3 py-2 text-xs text-muted-foreground">Type to search or create</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function NotesCell({ transactionId, initialValue, onSave }: { transactionId: number; initialValue: string | null; onSave: (id: number, value: string | null) => void }) {
  const [value, setValue] = useState(initialValue || '')

  return (
    <input
      type="text"
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={() => {
        if (value !== (initialValue || '')) {
          onSave(transactionId, value || null)
        }
      }}
      className="bg-input border border-border rounded px-2 py-1 text-xs w-full max-w-[200px]"
    />
  )
}

export default function Transactions() {
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const { start, end } = getFirstLastOfMonth(0)
  const [dateFrom, setDateFrom] = useState(searchParams.get('date_from') || start)
  const [dateTo, setDateTo] = useState(searchParams.get('date_to') || end)
  const [categoryId, setCategoryId] = useState(searchParams.get('category_id') || '')
  const [amountSign, setAmountSign] = useState(searchParams.get('amount_sign') || '')
  const [reviewStatus, setReviewStatus] = useState('')
  const [search, setSearch] = useState('')
  const [sourceFile, setSourceFile] = useState('')
  const [page, setPage] = useState(1)
  const [sorting, setSorting] = useState<SortingState>([])

  const params = {
    date_from: dateFrom,
    date_to: dateTo,
    category_ids: categoryId || undefined,
    amount_sign: amountSign || undefined,
    review_status: reviewStatus || undefined,
    search: search || undefined,
    source_file: sourceFile || undefined,
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

  const { data: sourceFiles = [] } = useQuery<string[]>({
    queryKey: ['transaction-source-files', dateFrom, dateTo],
    queryFn: () => transactionsApi.sourceFiles({ date_from: dateFrom, date_to: dateTo }),
  })

  const { data: allTags = [] } = useQuery<TagOption[]>({
    queryKey: ['tags', 'relevant', dateFrom, dateTo],
    queryFn: () => tagsApi.relevant({ date_from: dateFrom, date_to: dateTo }),
  })

  const flatCats = flatCategories(categories)

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: { id: number; category_id?: number; review_status?: string; notes?: string | null; tag_ids?: number[] }) =>
      transactionsApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })

  const createTagMutation = useMutation({
    mutationFn: (name: string) => tagsApi.create({ name, type: 'custom', color: '#3b82f6' }) as Promise<TagOption>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags'] })
    },
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

  const shiftMonth = (delta: number) => {
    const base = dateFrom ? new Date(dateFrom + 'T00:00:00') : new Date()
    base.setDate(1)
    base.setMonth(base.getMonth() + delta)
    const first = new Date(base.getFullYear(), base.getMonth(), 1)
    const last = new Date(base.getFullYear(), base.getMonth() + 1, 0)
    setDateFrom(first.toISOString().slice(0, 10))
    setDateTo(last.toISOString().slice(0, 10))
    setSourceFile('')
    setPage(1)
  }

  const clearAllFilters = () => {
    const { start, end } = getFirstLastOfMonth(0)
    setDateFrom(start)
    setDateTo(end)
    setCategoryId('')
    setReviewStatus('')
    setSearch('')
    setSourceFile('')
    setPage(1)
  }

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
        <p className="text-sm font-medium truncate max-w-xs">{row.original.description}</p>
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
      id: 'notes',
      header: 'Notes',
      cell: ({ row }) => (
        <NotesCell
          transactionId={row.original.id}
          initialValue={row.original.notes}
          onSave={(id, value) => updateMutation.mutate({ id, notes: value })}
        />
      ),
      size: 200,
    },
    {
      id: 'tags',
      header: 'Tags',
      cell: ({ row }) => (
        <TagsCell
          transaction={row.original}
          allTags={allTags}
          onUpdate={(id, tagIds) => updateMutation.mutate({ id, tag_ids: tagIds })}
          onCreateTag={name => createTagMutation.mutateAsync(name)}
        />
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
    {
      id: 'source-file',
      header: 'Source File',
      accessorKey: 'source_file',
      cell: ({ getValue }) => {
        const val = getValue<string | null>()
        return val
          ? <span className="text-xs text-gray-600 truncate max-w-[160px] block" title={val}>{val}</span>
          : <span className="text-gray-600">—</span>
      },
      size: 160,
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
        <button
          onClick={() => shiftMonth(-1)}
          className="flex items-center justify-center w-8 h-8 rounded-lg bg-secondary hover:bg-accent transition-colors self-end mb-0.5"
          title="Previous month"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">From</label>
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setSourceFile(''); setPage(1) }}
            className="bg-input border border-border rounded px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">To</label>
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setSourceFile(''); setPage(1) }}
            className="bg-input border border-border rounded px-3 py-1.5 text-sm" />
        </div>
        <button
          onClick={() => shiftMonth(1)}
          className="flex items-center justify-center w-8 h-8 rounded-lg bg-secondary hover:bg-accent transition-colors self-end mb-0.5"
          title="Next month"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={clearAllFilters}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary hover:bg-accent transition-colors text-sm font-medium"
          title="Clear all filters"
        >
          <X className="w-4 h-4" />
          Clear
        </button>
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
        {sourceFiles.length > 0 && (
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Source File</label>
            <select value={sourceFile} onChange={e => { setSourceFile(e.target.value); setPage(1) }}
              className="bg-input border border-border rounded px-3 py-1.5 text-sm max-w-[220px]">
              <option value="">All Files</option>
              {sourceFiles.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
        )}
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
