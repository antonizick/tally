import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Trash2, Pencil, Check, X, ChevronRight, ChevronDown,
  AlertTriangle, Tag, ChevronsDownUp, ChevronsUpDown,
} from 'lucide-react'
import { categoriesApi } from '@/lib/api'
import { useDashboardDates } from '@/store/dashboardDates'
import { cn } from '@/lib/utils'

interface Category {
  id: number
  name: string
  parent_id: number | null
  color: string | null
  icon: string | null
  transaction_count: number
  children: Category[]
}

const COLOR_SWATCHES = [
  '#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899',
  '#06b6d4', '#f97316', '#ef4444', '#6366f1', '#84cc16',
  '#10b981', '#14b8a6', '#f43f5e', '#94a3b8', '#6b7280',
]

function ColorPicker({
  value,
  onChange,
}: {
  value: string | null
  onChange: (c: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5 p-2 bg-popover border border-border rounded-lg shadow-lg w-48">
      {COLOR_SWATCHES.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn(
            'w-6 h-6 rounded-full border-2 transition-transform hover:scale-110',
            value === c ? 'border-white scale-110' : 'border-transparent',
          )}
          style={{ backgroundColor: c }}
        />
      ))}
      <input
        type="text"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder="#hex"
        maxLength={7}
        className="w-full mt-1 bg-input border border-border rounded px-2 py-1 text-xs font-mono"
      />
    </div>
  )
}

function DeleteConfirmDialog({
  category,
  onConfirm,
  onCancel,
}: {
  category: Category
  onConfirm: (force: boolean) => void
  onCancel: () => void
}) {
  const hasUsage = category.transaction_count > 0 || category.children.length > 0
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Delete "{category.name}"?</p>
            {hasUsage && (
              <div className="mt-2 text-sm text-muted-foreground space-y-1">
                {category.transaction_count > 0 && (
                  <p>{category.transaction_count} transaction(s) will become uncategorized.</p>
                )}
                {category.children.length > 0 && (
                  <p>{category.children.length} subcategory(ies) will be promoted to top-level.</p>
                )}
              </div>
            )}
            {!hasUsage && (
              <p className="mt-1 text-sm text-muted-foreground">This category has no transactions assigned.</p>
            )}
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            className="flex-1 bg-secondary rounded-lg py-2 text-sm hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(true)}
            className="flex-1 bg-destructive text-destructive-foreground rounded-lg py-2 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

function InlineEdit({
  value,
  onSave,
  onCancel,
  autoFocus = true,
}: {
  value: string
  onSave: (v: string) => void
  onCancel: () => void
  autoFocus?: boolean
}) {
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
    ref.current?.select()
  }, [autoFocus])

  return (
    <div className="flex items-center gap-1 flex-1 min-w-0">
      <input
        ref={ref}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); if (draft.trim()) onSave(draft.trim()) }
          if (e.key === 'Escape') onCancel()
        }}
        className="flex-1 min-w-0 bg-input border border-primary rounded px-2 py-0.5 text-sm"
      />
      <button
        onClick={() => draft.trim() && onSave(draft.trim())}
        className="text-emerald-400 hover:text-emerald-300 shrink-0"
      >
        <Check className="w-4 h-4" />
      </button>
      <button onClick={onCancel} className="text-muted-foreground hover:text-foreground shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

function SubcategoryRow({
  cat,
  onEdit,
  onDelete,
  onColorChange,
  onNavigate,
}: {
  cat: Category
  onEdit: (id: number, name: string) => void
  onDelete: (cat: Category) => void
  onColorChange: (id: number, color: string) => void
  onNavigate: (id: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [showPicker, setShowPicker] = useState(false)

  return (
    <div className="flex items-center gap-2 px-4 py-2 group hover:bg-accent/20 rounded-lg relative">
      {/* Color dot */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowPicker(p => !p)}
          className="w-3 h-3 rounded-full border border-white/20 shrink-0 hover:scale-125 transition-transform"
          style={{ backgroundColor: cat.color || '#6b7280' }}
          title="Change color"
        />
        {showPicker && (
          <div className="absolute left-0 top-5 z-20" onMouseLeave={() => setShowPicker(false)}>
            <ColorPicker
              value={cat.color}
              onChange={c => { onColorChange(cat.id, c); setShowPicker(false) }}
            />
          </div>
        )}
      </div>

      {editing ? (
        <InlineEdit
          value={cat.name}
          onSave={name => { onEdit(cat.id, name); setEditing(false) }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => onNavigate(cat.id)}
          className="text-sm flex-1 min-w-0 truncate text-left hover:text-primary hover:underline"
        >
          {cat.name}
        </button>
      )}

      {cat.transaction_count > 0 && (
        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
          {cat.transaction_count}
        </span>
      )}

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={() => setEditing(true)}
          className="text-muted-foreground hover:text-foreground p-0.5 rounded"
          title="Rename"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onDelete(cat)}
          className="text-muted-foreground hover:text-destructive p-0.5 rounded"
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

function ParentCategoryRow({
  cat,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  onColorChange,
  onAddChild,
  onNavigate,
}: {
  cat: Category
  expanded: boolean
  onToggle: (id: number) => void
  onEdit: (id: number, name: string) => void
  onDelete: (cat: Category) => void
  onColorChange: (id: number, color: string) => void
  onAddChild: (parentId: number, name: string) => void
  onNavigate: (id: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [addingChild, setAddingChild] = useState(false)
  const [childName, setChildName] = useState('')

  const handleAddChild = () => {
    if (childName.trim()) {
      onAddChild(cat.id, childName.trim())
      setChildName('')
      setAddingChild(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Parent header */}
      <div className="flex items-center gap-2 px-4 py-3 group hover:bg-accent/20">
        <button
          onClick={() => onToggle(cat.id)}
          className="text-muted-foreground hover:text-foreground shrink-0"
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        {/* Color */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowPicker(p => !p)}
            className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0 hover:scale-125 transition-transform"
            style={{ backgroundColor: cat.color || '#6b7280' }}
            title="Change color"
          />
          {showPicker && (
            <div className="absolute left-0 top-6 z-20" onMouseLeave={() => setShowPicker(false)}>
              <ColorPicker
                value={cat.color}
                onChange={c => { onColorChange(cat.id, c); setShowPicker(false) }}
              />
            </div>
          )}
        </div>

        {editing ? (
          <InlineEdit
            value={cat.name}
            onSave={name => { onEdit(cat.id, name); setEditing(false) }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => onNavigate(cat.id)}
            className="font-medium text-sm flex-1 text-left hover:text-primary hover:underline"
          >
            {cat.name}
          </button>
        )}

        {/* Counts */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
          {cat.transaction_count > 0 && (
            <span className="bg-muted px-1.5 py-0.5 rounded">{cat.transaction_count} tx</span>
          )}
          <span className="bg-muted px-1.5 py-0.5 rounded">{cat.children.length} sub</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={() => setEditing(true)}
            className="text-muted-foreground hover:text-foreground p-1 rounded"
            title="Rename"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => { setAddingChild(true); if (!expanded) onToggle(cat.id) }}
            className="text-muted-foreground hover:text-primary p-1 rounded"
            title="Add subcategory"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(cat)}
            className="text-muted-foreground hover:text-destructive p-1 rounded"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Children */}
      {expanded && (
        <div className="border-t border-border/50 px-3 py-1">
          {cat.children.length === 0 && !addingChild && (
            <p className="text-xs text-muted-foreground px-1 py-2">No subcategories</p>
          )}
          {cat.children.map(child => (
            <SubcategoryRow
              key={child.id}
              cat={child}
              onEdit={onEdit}
              onDelete={onDelete}
              onColorChange={onColorChange}
              onNavigate={onNavigate}
            />
          ))}
          {addingChild && (
            <div className="flex items-center gap-2 px-4 py-2">
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: cat.color || '#6b7280' }}
              />
              <input
                autoFocus
                value={childName}
                onChange={e => setChildName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleAddChild()
                  if (e.key === 'Escape') { setAddingChild(false); setChildName('') }
                }}
                placeholder="Subcategory name…"
                className="flex-1 bg-input border border-primary rounded px-2 py-0.5 text-sm"
              />
              <button onClick={handleAddChild} className="text-emerald-400 hover:text-emerald-300">
                <Check className="w-4 h-4" />
              </button>
              <button onClick={() => { setAddingChild(false); setChildName('') }} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function CategoriesManager() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { dateFrom, dateTo } = useDashboardDates()
  const [addingParent, setAddingParent] = useState(false)
  const [newParent, setNewParent] = useState({ name: '', color: '#3b82f6' })
  const [showNewParentPicker, setShowNewParentPicker] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null)
  // All collapsed by default; tracks which parent IDs are expanded
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())

  const toggleExpanded = (id: number) =>
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const handleNavigate = (id: number) => {
    navigate(`/transactions?date_from=${dateFrom}&date_to=${dateTo}&category_id=${id}`)
  }

  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ['categories', dateFrom, dateTo],
    queryFn: () => categoriesApi.list({ date_from: dateFrom, date_to: dateTo }),
  })

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => categoriesApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Record<string, unknown>) =>
      categoriesApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: ({ id, force }: { id: number; force: boolean }) =>
      categoriesApi.delete(id, force),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
      setPendingDelete(null)
    },
  })

  const handleEdit = (id: number, name: string) => {
    updateMutation.mutate({ id, name })
  }

  const handleColorChange = (id: number, color: string) => {
    updateMutation.mutate({ id, color })
  }

  const handleAddParent = () => {
    if (!newParent.name.trim()) return
    createMutation.mutate({ name: newParent.name.trim(), color: newParent.color })
    setNewParent({ name: '', color: '#3b82f6' })
    setAddingParent(false)
  }

  const handleAddChild = (parentId: number, name: string) => {
    const parent = categories.find(c => c.id === parentId)
    createMutation.mutate({
      name: name.trim(),
      parent_id: parentId,
      color: parent?.color || '#6b7280',
    })
  }

  const handleDelete = (cat: Category) => {
    setPendingDelete(cat)
  }

  const confirmDelete = (force: boolean) => {
    if (!pendingDelete) return
    deleteMutation.mutate({ id: pendingDelete.id, force })
  }

  if (isLoading) {
    return <div className="text-muted-foreground text-sm py-4">Loading categories…</div>
  }

  const total = categories.reduce((n, c) => n + 1 + c.children.length, 0)
  const totalTx = categories.reduce((n, c) =>
    n + c.transaction_count + c.children.reduce((m, ch) => m + ch.transaction_count, 0), 0)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {total} categories · {totalTx} assigned transactions
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpandedIds(new Set())}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-secondary hover:bg-accent transition-colors"
            title="Collapse all"
          >
            <ChevronsDownUp className="w-3.5 h-3.5" /> Collapse All
          </button>
          <button
            onClick={() => setExpandedIds(new Set(categories.map(c => c.id)))}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-secondary hover:bg-accent transition-colors"
            title="Expand all"
          >
            <ChevronsUpDown className="w-3.5 h-3.5" /> Expand All
          </button>
          <button
            onClick={() => setAddingParent(true)}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" /> Add Category
          </button>
        </div>
      </div>

      {/* New parent form */}
      {addingParent && (
        <div className="bg-card border border-primary/50 rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium">New Top-Level Category</p>
          <div className="flex items-center gap-3">
            {/* Color */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowNewParentPicker(p => !p)}
                className="w-7 h-7 rounded-full border-2 border-border hover:scale-110 transition-transform"
                style={{ backgroundColor: newParent.color }}
              />
              {showNewParentPicker && (
                <div className="absolute left-0 top-9 z-20" onMouseLeave={() => setShowNewParentPicker(false)}>
                  <ColorPicker
                    value={newParent.color}
                    onChange={c => { setNewParent(p => ({ ...p, color: c })); setShowNewParentPicker(false) }}
                  />
                </div>
              )}
            </div>
            <input
              autoFocus
              value={newParent.name}
              onChange={e => setNewParent(p => ({ ...p, name: e.target.value }))}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAddParent()
                if (e.key === 'Escape') { setAddingParent(false); setNewParent({ name: '', color: '#3b82f6' }) }
              }}
              placeholder="Category name…"
              className="flex-1 bg-input border border-border rounded px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAddParent}
              disabled={!newParent.name.trim() || createMutation.isPending}
              className="flex-1 bg-primary text-primary-foreground rounded-lg py-2 text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              Add
            </button>
            <button
              onClick={() => { setAddingParent(false); setNewParent({ name: '', color: '#3b82f6' }) }}
              className="px-4 bg-secondary rounded-lg text-sm hover:bg-accent transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Category tree */}
      <div className="space-y-2">
        {categories.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm border border-dashed border-border rounded-xl">
            No categories yet. Add one above or use "Seed Categories" in Quick Setup.
          </div>
        ) : (
          categories.map(cat => (
            <ParentCategoryRow
              key={cat.id}
              cat={cat}
              expanded={expandedIds.has(cat.id)}
              onToggle={toggleExpanded}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onColorChange={handleColorChange}
              onAddChild={handleAddChild}
              onNavigate={handleNavigate}
            />
          ))
        )}
      </div>

      {/* Usage hint */}
      <p className="text-xs text-muted-foreground">
        Double-click a name to rename it inline. Click the color dot to change the color. The number badge shows how many transactions are assigned.
      </p>

      {/* Delete confirmation dialog */}
      {pendingDelete && (
        <DeleteConfirmDialog
          category={pendingDelete}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  )
}
