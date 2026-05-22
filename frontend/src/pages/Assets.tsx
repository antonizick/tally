import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Plus, Trash2, Pencil, Check, X, TrendingUp, TrendingDown,
  RefreshCw, Copy, AlertTriangle, GripVertical, Minus,
} from 'lucide-react'
import { snapshotsApi, displayConfigApi } from '@/lib/api'
import { formatCurrency, formatDate, formatMonth } from '@/lib/utils'
import ChecklistTable from '@/components/checklist/ChecklistTable'

// ─── Types ──────────────────────────────────────────────────────────────────

interface SnapshotItem {
  id: number
  name: string
  item_type: string
  value: number
  is_asset: boolean
  ticker?: string
  shares?: number
  price_per_share?: number
  source: string
}

interface Snapshot {
  id: number
  effective_date: string
  notes: string | null
  total_assets: number
  total_liabilities: number
  net_worth: number
  items: SnapshotItem[]
}

interface DisplayConfig {
  asset_order: string[]
  liability_order: string[]
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ASSET_TYPES = [
  { value: 'checking',        label: 'Checking',         is_asset: true  },
  { value: 'savings',         label: 'Savings',          is_asset: true  },
  { value: 'retirement_401k', label: '401(k)',            is_asset: true  },
  { value: 'retirement_ira',  label: 'IRA',              is_asset: true  },
  { value: 'brokerage',       label: 'Brokerage/Stock',  is_asset: true  },
  { value: 'home',            label: 'Home Value',       is_asset: true  },
  { value: 'vehicle',         label: 'Vehicle',          is_asset: true  },
  { value: 'other_asset',     label: 'Other Asset',      is_asset: true  },
  { value: 'credit_card',     label: 'Credit Card Debt', is_asset: false },
  { value: 'car_loan',        label: 'Car Loan',         is_asset: false },
  { value: 'mortgage',        label: 'Mortgage',         is_asset: false },
  { value: 'other_liability', label: 'Other Liability',  is_asset: false },
]

function typeLabel(type: string) {
  return ASSET_TYPES.find(t => t.value === type)?.label || type
}

function isSpacer(key: string) {
  return key.startsWith('__spacer_')
}

function newSpacerId() {
  return `__spacer_${Date.now()}`
}

function serializeItems(items: SnapshotItem[]) {
  return items.map(i => ({
    name: i.name,
    item_type: i.item_type,
    value: i.value,
    is_asset: i.is_asset,
    ticker: i.ticker || undefined,
    shares: i.shares || undefined,
    price_per_share: i.price_per_share || undefined,
  }))
}

// Given a saved order (with spacers) and the actual items in a snapshot,
// return an ordered array of keys (item names + spacer ids) to render.
// Items not yet in the order are appended at the end.
function buildDisplayOrder(order: string[], items: SnapshotItem[]): string[] {
  const itemNames = new Set(items.map(i => i.name))
  // keep spacers always, keep names that exist in this snapshot
  const filtered = order.filter(k => isSpacer(k) || itemNames.has(k))
  // append items not yet in the order
  const inOrder = new Set(filtered.filter(k => !isSpacer(k)))
  const appended = items.filter(i => !inOrder.has(i.name)).map(i => i.name)
  return [...filtered, ...appended]
}

// ─── Sortable Spacer ─────────────────────────────────────────────────────────

function SortableSpacer({ id, onDelete }: { id: string; onDelete: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 my-1 group ${isDragging ? 'opacity-50' : ''}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="p-1 text-muted-foreground/30 hover:text-muted-foreground cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <div className="flex-1 border-t border-dashed border-border/50" />
      <button
        onClick={() => onDelete(id)}
        className="p-1 text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity rounded"
        title="Remove spacer"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

// ─── Sortable Item Row ───────────────────────────────────────────────────────

interface ItemRowProps {
  item: SnapshotItem
  onSave: (id: number, updated: Partial<SnapshotItem>) => void
  onDelete: (id: number) => void
  onRefreshStock?: (item: SnapshotItem) => void
  stockLoading?: boolean
}

function SortableItemRow(props: ItemRowProps) {
  const { item } = props
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.name })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'opacity-50 z-50' : ''}
    >
      <ItemRow {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  )
}

interface ItemRowInnerProps extends ItemRowProps {
  dragHandleProps?: Record<string, unknown>
}

function ItemRow({ item, onSave, onDelete, onRefreshStock, stockLoading, dragHandleProps }: ItemRowInnerProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({
    name: item.name,
    item_type: item.item_type,
    value: String(item.value),
    ticker: item.ticker || '',
    shares: item.shares ? String(item.shares) : '',
    is_asset: item.is_asset,
  })

  const handleSave = () => {
    if (!draft.name.trim() || !draft.value) return
    const t = ASSET_TYPES.find(x => x.value === draft.item_type)
    onSave(item.id, {
      name: draft.name.trim(),
      item_type: draft.item_type,
      value: parseFloat(draft.value),
      is_asset: t?.is_asset ?? draft.is_asset,
      ticker: draft.ticker || undefined,
      shares: draft.shares ? parseFloat(draft.shares) : undefined,
    })
    setEditing(false)
  }

  const handleCancel = () => {
    setDraft({
      name: item.name,
      item_type: item.item_type,
      value: String(item.value),
      ticker: item.ticker || '',
      shares: item.shares ? String(item.shares) : '',
      is_asset: item.is_asset,
    })
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="border border-primary/40 rounded-xl p-4 my-2 space-y-3 bg-accent/10">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Name</label>
            <input
              autoFocus
              value={draft.name}
              onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
              className="w-full bg-input border border-border rounded px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Type</label>
            <select
              value={draft.item_type}
              onChange={e => {
                const t = ASSET_TYPES.find(x => x.value === e.target.value)
                setDraft(d => ({ ...d, item_type: e.target.value, is_asset: t?.is_asset ?? d.is_asset }))
              }}
              className="w-full bg-input border border-border rounded px-3 py-1.5 text-sm"
            >
              {ASSET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Value ($)</label>
            <input
              type="number"
              value={draft.value}
              onChange={e => setDraft(d => ({ ...d, value: e.target.value }))}
              className="w-full bg-input border border-border rounded px-3 py-1.5 text-sm"
            />
          </div>
          {draft.item_type === 'brokerage' && (
            <>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Ticker</label>
                <input
                  value={draft.ticker}
                  onChange={e => setDraft(d => ({ ...d, ticker: e.target.value.toUpperCase() }))}
                  placeholder="TSLA"
                  className="w-full bg-input border border-border rounded px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Shares</label>
                <input
                  type="number"
                  value={draft.shares}
                  onChange={e => setDraft(d => ({ ...d, shares: e.target.value }))}
                  className="w-full bg-input border border-border rounded px-3 py-1.5 text-sm"
                />
              </div>
            </>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-1.5 rounded-lg text-sm font-medium hover:opacity-90"
          >
            <Check className="w-3.5 h-3.5" /> Save
          </button>
          <button onClick={handleCancel} className="px-4 py-1.5 bg-secondary rounded-lg text-sm hover:bg-accent">
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 py-2.5 border-b border-border/50 last:border-0 group">
      {/* Drag handle */}
      <button
        {...(dragHandleProps as React.ButtonHTMLAttributes<HTMLButtonElement>)}
        className="p-1 text-muted-foreground/30 hover:text-muted-foreground cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        title="Drag to reorder"
        tabIndex={-1}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <div className={`w-1.5 h-8 rounded-full shrink-0 ${item.is_asset ? 'bg-emerald-400' : 'bg-rose-400'}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.name}</p>
        <p className="text-xs text-muted-foreground">
          {typeLabel(item.item_type)}
          {item.ticker && ` · ${item.ticker} × ${item.shares}`}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className={`font-semibold text-sm ${item.is_asset ? 'text-emerald-400' : 'text-rose-400'}`}>
          {item.is_asset ? '' : '−'}{formatCurrency(Math.abs(item.value))}
        </p>
        {item.ticker && onRefreshStock && (
          <button
            onClick={() => onRefreshStock(item)}
            disabled={stockLoading}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 ml-auto mt-0.5 disabled:opacity-40"
          >
            <RefreshCw className={`w-3 h-3 ${stockLoading ? 'animate-spin' : ''}`} />
            {stockLoading ? 'updating…' : 'refresh'}
          </button>
        )}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={() => setEditing(true)}
          className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
          title="Edit"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onDelete(item.id)}
          className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors"
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ─── Add Item Form ────────────────────────────────────────────────────────────

interface AddItemFormProps {
  onAdd: (item: Omit<SnapshotItem, 'id' | 'source'>) => void
  onCancel: () => void
}

function AddItemForm({ onAdd, onCancel }: AddItemFormProps) {
  const [draft, setDraft] = useState({
    name: '', item_type: 'checking', value: '', ticker: '', shares: '', is_asset: true,
  })

  const handleAdd = () => {
    if (!draft.name.trim() || !draft.value) return
    const t = ASSET_TYPES.find(x => x.value === draft.item_type)
    onAdd({
      name: draft.name.trim(),
      item_type: draft.item_type,
      value: parseFloat(draft.value),
      is_asset: t?.is_asset ?? true,
      ticker: draft.ticker || undefined,
      shares: draft.shares ? parseFloat(draft.shares) : undefined,
    })
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-3">
      <h3 className="font-semibold text-sm">Add Asset or Liability</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Name</label>
          <input
            autoFocus
            value={draft.name}
            onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="e.g. Chase Checking"
            className="w-full bg-input border border-border rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Type</label>
          <select
            value={draft.item_type}
            onChange={e => {
              const t = ASSET_TYPES.find(x => x.value === e.target.value)
              setDraft(d => ({ ...d, item_type: e.target.value, is_asset: t?.is_asset ?? true }))
            }}
            className="w-full bg-input border border-border rounded px-3 py-2 text-sm"
          >
            {ASSET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Value ($)</label>
          <input
            type="number"
            value={draft.value}
            onChange={e => setDraft(d => ({ ...d, value: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="0.00"
            className="w-full bg-input border border-border rounded px-3 py-2 text-sm"
          />
        </div>
        {draft.item_type === 'brokerage' && (
          <>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Ticker</label>
              <input
                value={draft.ticker}
                onChange={e => setDraft(d => ({ ...d, ticker: e.target.value.toUpperCase() }))}
                placeholder="TSLA"
                className="w-full bg-input border border-border rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Shares</label>
              <input
                type="number"
                value={draft.shares}
                onChange={e => setDraft(d => ({ ...d, shares: e.target.value }))}
                placeholder="0"
                className="w-full bg-input border border-border rounded px-3 py-2 text-sm"
              />
            </div>
          </>
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleAdd}
          disabled={!draft.name.trim() || !draft.value}
          className="flex-1 bg-primary text-primary-foreground rounded-lg py-2 text-sm font-medium hover:opacity-90 disabled:opacity-40"
        >
          Add
        </button>
        <button onClick={onCancel} className="px-4 bg-secondary rounded-lg text-sm hover:bg-accent">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Sortable Section ─────────────────────────────────────────────────────────

interface SortableSectionProps {
  section: 'asset' | 'liability'
  displayOrder: string[]
  itemMap: Map<string, SnapshotItem>
  onDragEnd: (section: 'asset' | 'liability', displayOrder: string[], event: DragEndEvent) => void
  onAddSpacer: (section: 'asset' | 'liability') => void
  onDeleteSpacer: (section: 'asset' | 'liability', id: string) => void
  onSaveItem: (id: number, updated: Partial<SnapshotItem>) => void
  onDeleteItem: (id: number) => void
  onRefreshStock?: (item: SnapshotItem) => void
  stockLoading?: boolean
}

function SortableSection({
  section, displayOrder, itemMap,
  onDragEnd, onAddSpacer, onDeleteSpacer,
  onSaveItem, onDeleteItem, onRefreshStock, stockLoading,
}: SortableSectionProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={e => onDragEnd(section, displayOrder, e)}
    >
      <SortableContext items={displayOrder} strategy={verticalListSortingStrategy}>
        {displayOrder.map(key => {
          if (isSpacer(key)) {
            return (
              <SortableSpacer
                key={key}
                id={key}
                onDelete={id => onDeleteSpacer(section, id)}
              />
            )
          }
          const item = itemMap.get(key)
          if (!item) return null
          return (
            <SortableItemRow
              key={item.name}
              item={item}
              onSave={onSaveItem}
              onDelete={onDeleteItem}
              onRefreshStock={onRefreshStock}
              stockLoading={stockLoading}
            />
          )
        })}
      </SortableContext>
      <button
        onClick={() => onAddSpacer(section)}
        className="mt-2 w-full flex items-center justify-center gap-1.5 py-1 text-xs text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent/20 rounded transition-colors"
        title="Add spacer"
      >
        <Minus className="w-3 h-3" /> Add spacer
      </button>
    </DndContext>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Assets() {
  const qc = useQueryClient()
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<number | null>(null)
  const [showNewSnapshot, setShowNewSnapshot] = useState(false)
  const [newSnapshotDate, setNewSnapshotDate] = useState(new Date().toISOString().slice(0, 10))
  const [carryForward, setCarryForward] = useState(true)
  const [addingItem, setAddingItem] = useState(false)
  const [stockLoading, setStockLoading] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  const { data: snapshots = [], isLoading } = useQuery<Snapshot[]>({
    queryKey: ['snapshots'],
    queryFn: () => snapshotsApi.list(),
  })

  const { data: displayConfig = { asset_order: [], liability_order: [] } } =
    useQuery<DisplayConfig>({
      queryKey: ['display-config'],
      queryFn: () => displayConfigApi.get(),
    })

  const saveConfigMutation = useMutation({
    mutationFn: (config: DisplayConfig) => displayConfigApi.save(config),
    onMutate: async (newConfig) => {
      await qc.cancelQueries({ queryKey: ['display-config'] })
      const previous = qc.getQueryData<DisplayConfig>(['display-config'])
      qc.setQueryData(['display-config'], newConfig)
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(['display-config'], context.previous)
    },
    onSuccess: (data) => {
      qc.setQueryData(['display-config'], data)
    },
  })

  const currentMonthSnapshot = snapshots.find(s => {
    const [year, month] = s.effective_date.split('-').slice(0, 2)
    const today = new Date()
    return parseInt(year) === today.getFullYear() &&
           parseInt(month) === today.getMonth() + 1
  })

  const selected = snapshots.find(s => s.id === selectedSnapshotId) ?? currentMonthSnapshot ?? snapshots[0] ?? null

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => snapshotsApi.create(data),
    onSuccess: (data: Snapshot) => {
      qc.invalidateQueries({ queryKey: ['snapshots'] })
      qc.invalidateQueries({ queryKey: ['net-worth-trend'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setSelectedSnapshotId(data.id)
      setShowNewSnapshot(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Record<string, unknown>) =>
      snapshotsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['snapshots'] })
      qc.invalidateQueries({ queryKey: ['net-worth-trend'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => snapshotsApi.delete(id),
    onSuccess: (_, deletedId) => {
      qc.invalidateQueries({ queryKey: ['snapshots'] })
      qc.invalidateQueries({ queryKey: ['net-worth-trend'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setConfirmDeleteId(null)
      if (selected?.id === deletedId) {
        const remaining = snapshots.filter(s => s.id !== deletedId)
        setSelectedSnapshotId(remaining[0]?.id ?? null)
      }
    },
  })

  const priorSnapshot = snapshots.find(s => s.effective_date < newSnapshotDate) ?? snapshots[0] ?? null

  const handleCreate = () => {
    const items = carryForward && priorSnapshot ? serializeItems(priorSnapshot.items) : []
    createMutation.mutate({ effective_date: newSnapshotDate, items })
  }

  const handleSaveItem = (itemId: number, updated: Partial<SnapshotItem>) => {
    if (!selected) return
    updateMutation.mutate({
      id: selected.id,
      items: selected.items.map(i =>
        i.id === itemId ? { ...serializeItems([i])[0], ...updated } : serializeItems([i])[0]
      ),
    })
  }

  const handleDeleteItem = (itemId: number) => {
    if (!selected) return
    updateMutation.mutate({
      id: selected.id,
      items: serializeItems(selected.items.filter(i => i.id !== itemId)),
    })
  }

  const handleAddItem = (item: Omit<SnapshotItem, 'id' | 'source'>) => {
    if (!selected) return
    updateMutation.mutate({
      id: selected.id,
      items: [...serializeItems(selected.items), item],
    })
    // Append name to the appropriate global order if not already present
    const orderKey = item.is_asset ? 'asset_order' : 'liability_order'
    if (!displayConfig[orderKey].includes(item.name)) {
      saveConfigMutation.mutate({
        ...displayConfig,
        [orderKey]: [...displayConfig[orderKey], item.name],
      })
    }
    setAddingItem(false)
  }

  const handleRefreshStock = async (item: SnapshotItem) => {
    if (!selected || !item.ticker) return
    setStockLoading(true)
    try {
      const data = await snapshotsApi.stockPrice(item.ticker)
      updateMutation.mutate({
        id: selected.id,
        items: selected.items.map(i =>
          i.id === item.id
            ? { ...serializeItems([i])[0], value: data.price * (i.shares || 1), price_per_share: data.price }
            : serializeItems([i])[0]
        ),
      })
    } catch (e) {
      console.error('Stock fetch failed', e)
    } finally {
      setStockLoading(false)
    }
  }

  // ── Drag and spacer handlers ──────────────────────────────────────────────

  const handleDragEnd = useCallback((
    section: 'asset' | 'liability',
    currentDisplayOrder: string[],
    event: DragEndEvent,
  ) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const orderKey = section === 'asset' ? 'asset_order' : 'liability_order'
    // Use currentDisplayOrder (the rendered list) for index lookup, not the raw config
    // which may be empty or missing newly-added items
    const oldIndex = currentDisplayOrder.indexOf(String(active.id))
    const newIndex = currentDisplayOrder.indexOf(String(over.id))
    if (oldIndex === -1 || newIndex === -1) return
    const newOrder = arrayMove(currentDisplayOrder, oldIndex, newIndex)
    saveConfigMutation.mutate({ ...displayConfig, [orderKey]: newOrder })
  }, [displayConfig, saveConfigMutation])

  const handleAddSpacer = useCallback((section: 'asset' | 'liability') => {
    const orderKey = section === 'asset' ? 'asset_order' : 'liability_order'
    saveConfigMutation.mutate({
      ...displayConfig,
      [orderKey]: [...displayConfig[orderKey], newSpacerId()],
    })
  }, [displayConfig, saveConfigMutation])

  const handleDeleteSpacer = useCallback((section: 'asset' | 'liability', id: string) => {
    const orderKey = section === 'asset' ? 'asset_order' : 'liability_order'
    saveConfigMutation.mutate({
      ...displayConfig,
      [orderKey]: displayConfig[orderKey].filter(k => k !== id),
    })
  }, [displayConfig, saveConfigMutation])

  if (isLoading) return <div className="text-muted-foreground py-12 text-center">Loading…</div>

  const assets = selected?.items.filter(i => i.is_asset) ?? []
  const liabilities = selected?.items.filter(i => !i.is_asset) ?? []
  const assetMap = new Map(assets.map(i => [i.name, i]))
  const liabilityMap = new Map(liabilities.map(i => [i.name, i]))
  const assetDisplayOrder = buildDisplayOrder(displayConfig.asset_order, assets)
  const liabilityDisplayOrder = buildDisplayOrder(displayConfig.liability_order, liabilities)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

      {/* ── Left: snapshot list ───────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden self-start">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold">Monthly Snapshots</h2>
          <button
            onClick={() => { setShowNewSnapshot(true); setCarryForward(true) }}
            className="p-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90"
            title="New snapshot"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {showNewSnapshot && (
          <div className="px-5 py-4 border-b border-border space-y-3 bg-accent/20">
            <p className="text-sm font-medium">New Snapshot</p>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Date</label>
              <input
                type="date"
                value={newSnapshotDate}
                onChange={e => setNewSnapshotDate(e.target.value)}
                className="w-full bg-input border border-border rounded px-3 py-2 text-sm"
              />
            </div>
            {priorSnapshot && (
              <label className="flex items-start gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={carryForward}
                  onChange={e => setCarryForward(e.target.checked)}
                  className="mt-0.5 accent-primary"
                />
                <span className="text-xs text-muted-foreground group-hover:text-foreground leading-snug">
                  <span className="flex items-center gap-1 font-medium text-foreground">
                    <Copy className="w-3 h-3" /> Carry forward from {formatDate(priorSnapshot.effective_date)}
                  </span>
                  {priorSnapshot.items.length} item(s) — values editable after creation
                </span>
              </label>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={createMutation.isPending}
                className="flex-1 bg-primary text-primary-foreground rounded py-1.5 text-sm hover:opacity-90 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Creating…' : 'Create'}
              </button>
              <button
                onClick={() => setShowNewSnapshot(false)}
                className="px-3 bg-secondary rounded text-sm hover:bg-accent"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="divide-y divide-border">
          {snapshots.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              No snapshots yet. Create your first one.
            </div>
          ) : (
            snapshots.map(s => (
              <div key={s.id} className="group relative">
                {confirmDeleteId === s.id ? (
                  <div className="px-5 py-3 bg-destructive/10 border-l-2 border-destructive space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
                      <span>Delete {formatDate(s.effective_date)}?</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => deleteMutation.mutate(s.id)}
                        disabled={deleteMutation.isPending}
                        className="flex-1 bg-destructive text-destructive-foreground rounded py-1 text-xs font-medium hover:opacity-90 disabled:opacity-50"
                      >
                        {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="flex-1 bg-secondary rounded py-1 text-xs hover:bg-accent"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setSelectedSnapshotId(s.id)}
                    className={`w-full text-left px-5 py-4 transition-colors hover:bg-accent/30 pr-10 ${
                      selected?.id === s.id ? 'bg-accent/50 border-l-2 border-primary' : ''
                    }`}
                  >
                    <p className="text-sm font-medium">{formatDate(s.effective_date)}</p>
                    <p className={`text-sm ${s.net_worth >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatCurrency(s.net_worth)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {s.items.length} item{s.items.length !== 1 ? 's' : ''}
                    </p>
                  </button>
                )}
                {confirmDeleteId !== s.id && (
                  <button
                    onClick={e => { e.stopPropagation(); setConfirmDeleteId(s.id) }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete snapshot"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Right: snapshot detail ────────────────────────────────────────── */}
      {selected ? (
        <div className="lg:col-span-2 space-y-4">

          <h2 className="text-2xl font-bold tracking-tight">{formatMonth(selected.effective_date)}</h2>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-card border border-border rounded-xl p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Total Assets</p>
              <p className="text-xl font-bold text-emerald-400">{formatCurrency(selected.total_assets)}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Total Liabilities</p>
              <p className="text-xl font-bold text-rose-400">{formatCurrency(selected.total_liabilities)}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Net Worth</p>
              <p className={`text-xl font-bold ${selected.net_worth >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formatCurrency(selected.net_worth)}
              </p>
            </div>
          </div>

          {/* Assets */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <h3 className="font-semibold">Assets</h3>
              <span className="text-sm text-muted-foreground ml-auto">{formatCurrency(selected.total_assets)}</span>
            </div>
            {assets.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No assets. Add one below.</p>
            ) : (
              <SortableSection
                section="asset"
                displayOrder={assetDisplayOrder}
                itemMap={assetMap}
                onDragEnd={handleDragEnd}
                onAddSpacer={handleAddSpacer}
                onDeleteSpacer={handleDeleteSpacer}
                onSaveItem={handleSaveItem}
                onDeleteItem={handleDeleteItem}
                onRefreshStock={handleRefreshStock}
                stockLoading={stockLoading}
              />
            )}
          </div>

          {/* Liabilities */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <TrendingDown className="w-4 h-4 text-rose-400" />
              <h3 className="font-semibold">Liabilities</h3>
              <span className="text-sm text-muted-foreground ml-auto">{formatCurrency(selected.total_liabilities)}</span>
            </div>
            {liabilities.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No liabilities. Add one below.</p>
            ) : (
              <SortableSection
                section="liability"
                displayOrder={liabilityDisplayOrder}
                itemMap={liabilityMap}
                onDragEnd={handleDragEnd}
                onAddSpacer={handleAddSpacer}
                onDeleteSpacer={handleDeleteSpacer}
                onSaveItem={handleSaveItem}
                onDeleteItem={handleDeleteItem}
              />
            )}
          </div>

          {addingItem ? (
            <AddItemForm onAdd={handleAddItem} onCancel={() => setAddingItem(false)} />
          ) : (
            <button
              onClick={() => setAddingItem(true)}
              className="w-full flex items-center justify-center gap-2 border border-dashed border-border rounded-xl py-3 text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Asset or Liability
            </button>
          )}

          <ChecklistTable snapshotId={selected.id} />
        </div>
      ) : (
        <div className="lg:col-span-2 flex items-center justify-center text-muted-foreground py-24">
          Select a snapshot or create one to get started.
        </div>
      )}
    </div>
  )
}
