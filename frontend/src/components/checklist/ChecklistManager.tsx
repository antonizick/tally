import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import { checklistApi } from '@/lib/api'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChecklistStatus {
  id: number
  name: string
  color: string | null
  sort_order: number
}

interface ChecklistTemplate {
  id: number
  label: string
  description: string | null
  sort_order: number
  is_active: boolean
}

// ─── Status Manager ───────────────────────────────────────────────────────────

function StatusManager() {
  const qc = useQueryClient()
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#6366f1')
  const [newOrder, setNewOrder] = useState(0)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState({ name: '', color: '', sort_order: 0 })

  const { data: statuses = [] } = useQuery<ChecklistStatus[]>({
    queryKey: ['checklist-statuses'],
    queryFn: () => checklistApi.listStatuses(),
  })

  const createStatus = useMutation({
    mutationFn: () => checklistApi.createStatus({ name: newName.trim(), color: newColor || null, sort_order: newOrder }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['checklist-statuses'] })
      setShowNew(false)
      setNewName('')
      setNewColor('#6366f1')
      setNewOrder(0)
    },
  })

  const updateStatus = useMutation({
    mutationFn: ({ id }: { id: number }) =>
      checklistApi.updateStatus(id, { name: editDraft.name, color: editDraft.color || null, sort_order: editDraft.sort_order }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['checklist-statuses'] })
      setEditingId(null)
    },
  })

  const deleteStatus = useMutation({
    mutationFn: (id: number) => checklistApi.deleteStatus(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['checklist-statuses'] }),
  })

  const startEdit = (s: ChecklistStatus) => {
    setEditingId(s.id)
    setEditDraft({ name: s.name, color: s.color ?? '', sort_order: s.sort_order })
  }

  return (
    <section className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h2 className="font-semibold">Checklist Statuses</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Statuses available when updating checklist items</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm hover:opacity-90"
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      {showNew && (
        <div className="px-6 py-4 border-b border-border bg-accent/10 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground block mb-1">Name</label>
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && newName.trim() && createStatus.mutate()}
                placeholder="e.g. Done"
                className="w-full bg-input border border-border rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Color (optional)</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={newColor}
                  onChange={e => setNewColor(e.target.value)}
                  className="w-10 h-9 rounded border border-border cursor-pointer bg-transparent"
                />
                <input
                  value={newColor}
                  onChange={e => setNewColor(e.target.value)}
                  placeholder="#6366f1"
                  className="flex-1 bg-input border border-border rounded px-3 py-2 text-sm font-mono"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Sort order</label>
              <input
                type="number"
                value={newOrder}
                onChange={e => setNewOrder(parseInt(e.target.value) || 0)}
                className="w-full bg-input border border-border rounded px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => createStatus.mutate()}
              disabled={!newName.trim() || createStatus.isPending}
              className="flex-1 bg-primary text-primary-foreground rounded py-2 text-sm hover:opacity-90 disabled:opacity-50"
            >
              Save Status
            </button>
            <button onClick={() => setShowNew(false)} className="px-4 bg-secondary rounded text-sm hover:bg-accent">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="divide-y divide-border">
        {statuses.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-muted-foreground">
            No statuses yet. Add one to start.
          </div>
        ) : (
          statuses.map(s => (
            <div key={s.id} className="px-6 py-3">
              {editingId === s.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <input
                        autoFocus
                        value={editDraft.name}
                        onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))}
                        className="w-full bg-input border border-border rounded px-3 py-1.5 text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={editDraft.color || '#6366f1'}
                        onChange={e => setEditDraft(d => ({ ...d, color: e.target.value }))}
                        className="w-9 h-8 rounded border border-border cursor-pointer bg-transparent"
                      />
                      <input
                        value={editDraft.color}
                        onChange={e => setEditDraft(d => ({ ...d, color: e.target.value }))}
                        className="flex-1 bg-input border border-border rounded px-2 py-1.5 text-sm font-mono"
                      />
                    </div>
                    <div>
                      <input
                        type="number"
                        value={editDraft.sort_order}
                        onChange={e => setEditDraft(d => ({ ...d, sort_order: parseInt(e.target.value) || 0 }))}
                        className="w-full bg-input border border-border rounded px-3 py-1.5 text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateStatus.mutate({ id: s.id })}
                      disabled={!editDraft.name.trim()}
                      className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1 rounded text-sm hover:opacity-90 disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" /> Save
                    </button>
                    <button onClick={() => setEditingId(null)} className="px-3 py-1 bg-secondary rounded text-sm hover:bg-accent">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  {s.color && (
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">sort: {s.sort_order}</p>
                  </div>
                  <button onClick={() => startEdit(s)} className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => deleteStatus.mutate(s.id)} className="p-1.5 text-muted-foreground hover:text-destructive rounded transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  )
}

// ─── Template Manager ─────────────────────────────────────────────────────────

function TemplateManager() {
  const qc = useQueryClient()
  const [showNew, setShowNew] = useState(false)
  const [newDraft, setNewDraft] = useState({ label: '', description: '', sort_order: 0, is_active: true })
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState({ label: '', description: '', sort_order: 0, is_active: true })

  const { data: templates = [] } = useQuery<ChecklistTemplate[]>({
    queryKey: ['checklist-templates'],
    queryFn: () => checklistApi.listTemplates(),
  })

  const createTemplate = useMutation({
    mutationFn: () => checklistApi.createTemplate({
      label: newDraft.label.trim(),
      description: newDraft.description.trim() || null,
      sort_order: newDraft.sort_order,
      is_active: newDraft.is_active,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['checklist-templates'] })
      setShowNew(false)
      setNewDraft({ label: '', description: '', sort_order: 0, is_active: true })
    },
  })

  const updateTemplate = useMutation({
    mutationFn: ({ id }: { id: number }) =>
      checklistApi.updateTemplate(id, {
        label: editDraft.label,
        description: editDraft.description || null,
        sort_order: editDraft.sort_order,
        is_active: editDraft.is_active,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['checklist-templates'] })
      setEditingId(null)
    },
  })

  const deleteTemplate = useMutation({
    mutationFn: (id: number) => checklistApi.deleteTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['checklist-templates'] }),
  })

  const startEdit = (t: ChecklistTemplate) => {
    setEditingId(t.id)
    setEditDraft({ label: t.label, description: t.description ?? '', sort_order: t.sort_order, is_active: t.is_active })
  }

  return (
    <section className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h2 className="font-semibold">Checklist Items</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Active items are seeded into each new monthly snapshot</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm hover:opacity-90"
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      {showNew && (
        <div className="px-6 py-4 border-b border-border bg-accent/10 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground block mb-1">Label</label>
              <input
                autoFocus
                value={newDraft.label}
                onChange={e => setNewDraft(d => ({ ...d, label: e.target.value }))}
                placeholder="e.g. Review 401k balance"
                className="w-full bg-input border border-border rounded px-3 py-2 text-sm"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground block mb-1">Description (optional)</label>
              <input
                value={newDraft.description}
                onChange={e => setNewDraft(d => ({ ...d, description: e.target.value }))}
                placeholder="Any additional context…"
                className="w-full bg-input border border-border rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Sort order</label>
              <input
                type="number"
                value={newDraft.sort_order}
                onChange={e => setNewDraft(d => ({ ...d, sort_order: parseInt(e.target.value) || 0 }))}
                className="w-full bg-input border border-border rounded px-3 py-2 text-sm"
              />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newDraft.is_active}
                  onChange={e => setNewDraft(d => ({ ...d, is_active: e.target.checked }))}
                  className="accent-primary"
                />
                <span className="text-sm">Active (seed into new snapshots)</span>
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => createTemplate.mutate()}
              disabled={!newDraft.label.trim() || createTemplate.isPending}
              className="flex-1 bg-primary text-primary-foreground rounded py-2 text-sm hover:opacity-90 disabled:opacity-50"
            >
              Save Item
            </button>
            <button onClick={() => setShowNew(false)} className="px-4 bg-secondary rounded text-sm hover:bg-accent">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="divide-y divide-border">
        {templates.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-muted-foreground">
            No checklist items yet. Add one and it will appear in all future snapshots.
          </div>
        ) : (
          templates.map(t => (
            <div key={t.id} className="px-6 py-3">
              {editingId === t.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <input
                        autoFocus
                        value={editDraft.label}
                        onChange={e => setEditDraft(d => ({ ...d, label: e.target.value }))}
                        className="w-full bg-input border border-border rounded px-3 py-1.5 text-sm"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        value={editDraft.description}
                        onChange={e => setEditDraft(d => ({ ...d, description: e.target.value }))}
                        placeholder="Description…"
                        className="w-full bg-input border border-border rounded px-3 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <input
                        type="number"
                        value={editDraft.sort_order}
                        onChange={e => setEditDraft(d => ({ ...d, sort_order: parseInt(e.target.value) || 0 }))}
                        className="w-full bg-input border border-border rounded px-3 py-1.5 text-sm"
                      />
                    </div>
                    <div className="flex items-center">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editDraft.is_active}
                          onChange={e => setEditDraft(d => ({ ...d, is_active: e.target.checked }))}
                          className="accent-primary"
                        />
                        <span className="text-sm">Active</span>
                      </label>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateTemplate.mutate({ id: t.id })}
                      disabled={!editDraft.label.trim()}
                      className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1 rounded text-sm hover:opacity-90 disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" /> Save
                    </button>
                    <button onClick={() => setEditingId(null)} className="px-3 py-1 bg-secondary rounded text-sm hover:bg-accent">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{t.label}</p>
                      {!t.is_active && (
                        <span className="text-xs text-muted-foreground bg-secondary px-1.5 py-0.5 rounded shrink-0">inactive</span>
                      )}
                    </div>
                    {t.description && (
                      <p className="text-xs text-muted-foreground truncate">{t.description}</p>
                    )}
                  </div>
                  <button onClick={() => startEdit(t)} className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors shrink-0">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => deleteTemplate.mutate(t.id)} className="p-1.5 text-muted-foreground hover:text-destructive rounded transition-colors shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function ChecklistManager() {
  return (
    <div className="space-y-8">
      <StatusManager />
      <TemplateManager />
    </div>
  )
}
