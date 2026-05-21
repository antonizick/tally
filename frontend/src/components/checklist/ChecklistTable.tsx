import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, ClipboardList } from 'lucide-react'
import { checklistApi } from '@/lib/api'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChecklistStatus {
  id: number
  name: string
  color: string | null
  sort_order: number
}

interface ChecklistEntry {
  id: number
  snapshot_id: number
  template_id: number | null
  label: string
  status_id: number | null
  status: ChecklistStatus | null
  note_1: string | null
  note_2: string | null
  updated_at: string | null
  sort_order: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatUpdatedAt(ts: string | null): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function StatusDot({ color }: { color: string | null }) {
  if (!color) return null
  return (
    <span
      className="inline-block w-2 h-2 rounded-full shrink-0"
      style={{ backgroundColor: color }}
    />
  )
}

// ─── Entry Row ───────────────────────────────────────────────────────────────

interface EntryRowProps {
  entry: ChecklistEntry
  statuses: ChecklistStatus[]
  onUpdate: (id: number, data: Record<string, unknown>) => void
  onDelete: (id: number) => void
}

function EntryRow({ entry, statuses, onUpdate, onDelete }: EntryRowProps) {
  const [note1, setNote1] = useState(entry.note_1 ?? '')
  const [note2, setNote2] = useState(entry.note_2 ?? '')

  const hasStatus = entry.status_id !== null

  return (
    <tr className={`border-b border-border/40 transition-colors ${!hasStatus ? 'bg-amber-500/5' : ''}`}>
      <td className="px-3 py-2.5 text-sm font-medium max-w-[200px]">
        <span className="truncate block" title={entry.label}>{entry.label}</span>
      </td>
      <td className="px-3 py-2.5">
        <select
          value={entry.status_id ?? ''}
          onChange={e => {
            const val = e.target.value
            onUpdate(entry.id, { status_id: val === '' ? null : parseInt(val) })
          }}
          className="w-full bg-input border border-border rounded px-2 py-1 text-sm"
        >
          <option value="">— unset —</option>
          {statuses.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2.5">
        <input
          value={note1}
          onChange={e => setNote1(e.target.value)}
          onBlur={() => {
            if (note1 !== (entry.note_1 ?? '')) onUpdate(entry.id, { note_1: note1 || null })
          }}
          placeholder="Note / link…"
          className="w-full bg-input border border-border rounded px-2 py-1 text-sm"
        />
      </td>
      <td className="px-3 py-2.5">
        <input
          value={note2}
          onChange={e => setNote2(e.target.value)}
          onBlur={() => {
            if (note2 !== (entry.note_2 ?? '')) onUpdate(entry.id, { note_2: note2 || null })
          }}
          placeholder="Note / link…"
          className="w-full bg-input border border-border rounded px-2 py-1 text-sm"
        />
      </td>
      <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
        {formatUpdatedAt(entry.updated_at)}
      </td>
      <td className="px-3 py-2.5">
        <button
          onClick={() => onDelete(entry.id)}
          className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors"
          title="Delete entry"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  )
}

// ─── Add Entry Form ───────────────────────────────────────────────────────────

interface AddEntryFormProps {
  snapshotId: number
  onAdd: (label: string) => void
  onCancel: () => void
}

function AddEntryForm({ snapshotId: _snapshotId, onAdd, onCancel }: AddEntryFormProps) {
  const [label, setLabel] = useState('')
  return (
    <tr className="border-b border-border/40 bg-accent/10">
      <td colSpan={6} className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={label}
            onChange={e => setLabel(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && label.trim()) onAdd(label.trim())
              if (e.key === 'Escape') onCancel()
            }}
            placeholder="One-off item label…"
            className="flex-1 bg-input border border-border rounded px-3 py-1.5 text-sm"
          />
          <button
            onClick={() => { if (label.trim()) onAdd(label.trim()) }}
            disabled={!label.trim()}
            className="bg-primary text-primary-foreground px-3 py-1.5 rounded text-sm hover:opacity-90 disabled:opacity-40"
          >
            Add
          </button>
          <button onClick={onCancel} className="px-3 py-1.5 bg-secondary rounded text-sm hover:bg-accent">
            Cancel
          </button>
        </div>
      </td>
    </tr>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface ChecklistTableProps {
  snapshotId: number
}

export default function ChecklistTable({ snapshotId }: ChecklistTableProps) {
  const qc = useQueryClient()
  const [addingEntry, setAddingEntry] = useState(false)
  const [confirmSeed, setConfirmSeed] = useState(false)

  const { data: entries = [] } = useQuery<ChecklistEntry[]>({
    queryKey: ['checklist-entries', snapshotId],
    queryFn: () => checklistApi.listEntries(snapshotId),
  })

  const { data: statuses = [] } = useQuery<ChecklistStatus[]>({
    queryKey: ['checklist-statuses'],
    queryFn: () => checklistApi.listStatuses(),
  })

  const updateEntry = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      checklistApi.updateEntry(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['checklist-entries', snapshotId] }),
  })

  const deleteEntry = useMutation({
    mutationFn: (id: number) => checklistApi.deleteEntry(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['checklist-entries', snapshotId] }),
  })

  const createEntry = useMutation({
    mutationFn: (label: string) =>
      checklistApi.createEntry({ snapshot_id: snapshotId, label, sort_order: entries.length }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['checklist-entries', snapshotId] })
      setAddingEntry(false)
    },
  })

  const seedEntries = useMutation({
    mutationFn: () => checklistApi.seedEntries(snapshotId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['checklist-entries', snapshotId] })
      setConfirmSeed(false)
    },
  })

  const pending = entries.filter(e => e.status_id === null).length
  const total = entries.length

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
        <span
          title="Double-click to apply default checklist"
          onDoubleClick={() => setConfirmSeed(true)}
          className="cursor-pointer select-none"
        >
          <ClipboardList className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors" />
        </span>
        <h3 className="font-semibold">Monthly Checklist</h3>
        {total > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            {pending > 0
              ? <span className="text-amber-400 font-medium">{pending} unset</span>
              : <span className="text-emerald-400">all set</span>
            }
            {' '}/ {total} items
          </span>
        )}
      </div>

      {confirmSeed && (
        <div className="px-5 py-3 border-b border-border bg-accent/20 flex items-center gap-3">
          <p className="text-sm flex-1">
            Apply the default checklist to this snapshot? Any already-existing items will be skipped.
          </p>
          <button
            onClick={() => seedEntries.mutate()}
            disabled={seedEntries.isPending}
            className="bg-primary text-primary-foreground px-3 py-1.5 rounded text-sm hover:opacity-90 disabled:opacity-50 shrink-0"
          >
            {seedEntries.isPending ? 'Applying…' : 'Yes, apply'}
          </button>
          <button
            onClick={() => setConfirmSeed(false)}
            className="px-3 py-1.5 bg-secondary rounded text-sm hover:bg-accent shrink-0"
          >
            Cancel
          </button>
        </div>
      )}

      {entries.length === 0 && !addingEntry ? (
        <div className="px-5 py-6 text-center text-sm text-muted-foreground">
          No checklist items for this snapshot.
          {' '}
          <button
            onClick={() => setAddingEntry(true)}
            className="text-primary hover:underline"
          >
            Add one
          </button>
          {' '}or set up templates in Settings → Checklist.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/20">
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-[180px]">Item</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-[160px]">Status</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Note 1</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Note 2</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-[160px]">Updated</th>
                <th className="px-3 py-2 w-8" />
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  statuses={statuses}
                  onUpdate={(id, data) => updateEntry.mutate({ id, data })}
                  onDelete={id => deleteEntry.mutate(id)}
                />
              ))}
              {addingEntry && (
                <AddEntryForm
                  snapshotId={snapshotId}
                  onAdd={label => createEntry.mutate(label)}
                  onCancel={() => setAddingEntry(false)}
                />
              )}
            </tbody>
          </table>
        </div>
      )}

      {!addingEntry && (entries.length > 0) && (
        <div className="px-3 py-2 border-t border-border/40">
          <button
            onClick={() => setAddingEntry(true)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1 px-2 rounded hover:bg-accent/30"
          >
            <Plus className="w-3.5 h-3.5" /> Add one-off item
          </button>
        </div>
      )}
    </div>
  )
}
