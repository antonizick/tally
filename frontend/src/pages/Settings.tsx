import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, CheckCircle, Pencil, Tag } from 'lucide-react'
import * as Tabs from '@radix-ui/react-tabs'
import { accountsApi, categoriesApi, tagsApi, netWorthApi, stockHoldingsApi } from '@/lib/api'
import CategoriesManager from '@/components/settings/CategoriesManager'
import CategorizationExemptions from '@/components/settings/CategorizationExemptions'
import AdminTab from '@/components/settings/AdminTab'
import ChecklistManager from '@/components/checklist/ChecklistManager'

interface Account {
  id: number
  name: string
  type: string
  institution: string | null
  is_active: boolean
}

interface StockHolding {
  id: number
  ticker: string
  name: string | null
  quantity: number
}

interface TagItem {
  id: number
  name: string
  type: string
  color: string | null
}

const TAG_TYPES = ['custom', 'person', 'project']
const TAG_PRESET_COLORS = ['#3b82f6','#ec4899','#22c55e','#f59e0b','#8b5cf6','#06b6d4','#f97316','#ef4444']

const ACCOUNT_TYPES = [
  'checking', 'savings', 'credit_card', 'retirement_401k', 'retirement_ira',
  'brokerage', 'home', 'vehicle', 'other_asset', 'loan', 'mortgage', 'other_liability',
]

export default function Settings() {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState('general')
  const [newAccount, setNewAccount] = useState({ name: '', type: 'checking', institution: '' })
  const [showNewAccount, setShowNewAccount] = useState(false)
  const [seeded, setSeeded] = useState<string[]>([])

  const [newHolding, setNewHolding] = useState({ ticker: '', name: '', quantity: '' })
  const [showNewHolding, setShowNewHolding] = useState(false)
  const [editingHolding, setEditingHolding] = useState<{ id: number; quantity: string } | null>(null)

  const [newTag, setNewTag] = useState({ name: '', type: 'custom', color: '#3b82f6' })
  const [showNewTag, setShowNewTag] = useState(false)

  const { data: accounts = [] } = useQuery<Account[]>({ queryKey: ['accounts'], queryFn: accountsApi.list })
  const { data: holdings = [] } = useQuery<StockHolding[]>({ queryKey: ['stock-holdings'], queryFn: stockHoldingsApi.list })
  const { data: tags = [] } = useQuery<TagItem[]>({ queryKey: ['tags'], queryFn: tagsApi.list })

  const createAccount = useMutation({
    mutationFn: (data: Record<string, unknown>) => accountsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] })
      setShowNewAccount(false)
      setNewAccount({ name: '', type: 'checking', institution: '' })
    },
  })

  const deleteAccount = useMutation({
    mutationFn: (id: number) => accountsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  })

  const createHolding = useMutation({
    mutationFn: (data: Record<string, unknown>) => stockHoldingsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-holdings'] })
      setShowNewHolding(false)
      setNewHolding({ ticker: '', name: '', quantity: '' })
    },
  })

  const updateHolding = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) => stockHoldingsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-holdings'] })
      setEditingHolding(null)
    },
  })

  const deleteHolding = useMutation({
    mutationFn: (id: number) => stockHoldingsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stock-holdings'] }),
  })

  const seedCategories = useMutation({
    mutationFn: () => categoriesApi.seed(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      setSeeded(s => [...s, 'categories'])
    },
  })

  const seedTags = useMutation({
    mutationFn: () => tagsApi.seed(),
    onSuccess: () => setSeeded(s => [...s, 'tags']),
  })

  const seedViews = useMutation({
    mutationFn: () => netWorthApi.seedViews(),
    onSuccess: () => setSeeded(s => [...s, 'views']),
  })

  const createTag = useMutation({
    mutationFn: (data: Record<string, unknown>) => tagsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags'] })
      setShowNewTag(false)
      setNewTag({ name: '', type: 'custom', color: '#3b82f6' })
    },
  })

  const deleteTag = useMutation({
    mutationFn: (id: number) => tagsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tags'] }),
  })

  return (
    <div>
      <div className="flex border-b border-border mb-6 gap-1">
        <button
          onClick={() => setActiveTab('general')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'general'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          General
        </button>
        <button
          onClick={() => setActiveTab('checklist')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'checklist'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Checklist
        </button>
        <button
          onClick={() => setActiveTab('admin')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'admin'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Administration
        </button>
      </div>

      {activeTab === 'general' && (
        <div className="max-w-3xl space-y-8">
          {/* Quick Setup */}
          <section className="bg-card border border-border rounded-xl p-6">
        <h2 className="font-semibold mb-1">Quick Setup</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Seed default categories, tags, and net worth views to get started fast.
        </p>
        <div className="flex flex-wrap gap-3">
          {([
            { key: 'categories', label: 'Seed Categories', fn: seedCategories },
            { key: 'tags', label: 'Seed Tags', fn: seedTags },
            { key: 'views', label: 'Seed Net Worth Views', fn: seedViews },
          ] as Array<{ key: string; label: string; fn: typeof seedCategories }>).map(({ key, label, fn }) => (
            <button
              key={key}
              onClick={() => fn.mutate()}
              disabled={fn.isPending || seeded.includes(key)}
              className="flex items-center gap-2 px-4 py-2 bg-secondary text-sm rounded-lg hover:bg-accent disabled:opacity-50 transition-colors"
            >
              {seeded.includes(key) ? (
                <><CheckCircle className="w-4 h-4 text-emerald-400" /> Done</>
              ) : label}
            </button>
          ))}
        </div>
      </section>

      {/* Accounts */}
      <section className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold">Accounts</h2>
          <button
            onClick={() => setShowNewAccount(true)}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm hover:opacity-90"
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>

        {showNewAccount && (
          <div className="px-6 py-4 border-b border-border bg-accent/10 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Account Name</label>
                <input
                  value={newAccount.name}
                  onChange={e => setNewAccount(a => ({ ...a, name: e.target.value }))}
                  placeholder="e.g. Chase Checking"
                  className="w-full bg-input border border-border rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Type</label>
                <select
                  value={newAccount.type}
                  onChange={e => setNewAccount(a => ({ ...a, type: e.target.value }))}
                  className="w-full bg-input border border-border rounded px-3 py-2 text-sm"
                >
                  {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground block mb-1">Institution (optional)</label>
                <input
                  value={newAccount.institution}
                  onChange={e => setNewAccount(a => ({ ...a, institution: e.target.value }))}
                  placeholder="e.g. Chase Bank"
                  className="w-full bg-input border border-border rounded px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => createAccount.mutate({ ...newAccount })}
                className="flex-1 bg-primary text-primary-foreground rounded py-2 text-sm hover:opacity-90"
              >
                Save Account
              </button>
              <button onClick={() => setShowNewAccount(false)} className="px-4 bg-secondary rounded text-sm hover:bg-accent">
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="divide-y divide-border">
          {accounts.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-muted-foreground">
              No accounts yet. Add one to start importing CSV files.
            </div>
          ) : (
            accounts.map((a: Account) => (
              <div key={a.id} className="flex items-center gap-4 px-6 py-4">
                <div className="flex-1">
                  <p className="text-sm font-medium">{a.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.type.replace(/_/g, ' ')}
                    {a.institution && ` · ${a.institution}`}
                  </p>
                </div>
                <button
                  onClick={() => deleteAccount.mutate(a.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Stock & ETF Holdings */}
      <section className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold">Stock &amp; ETF Holdings</h2>
          <button
            onClick={() => setShowNewHolding(true)}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm hover:opacity-90"
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>

        {showNewHolding && (
          <div className="px-6 py-4 border-b border-border bg-accent/10 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Ticker</label>
                <input
                  value={newHolding.ticker}
                  onChange={e => setNewHolding(h => ({ ...h, ticker: e.target.value.toUpperCase() }))}
                  placeholder="e.g. AAPL"
                  className="w-full bg-input border border-border rounded px-3 py-2 text-sm font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Name (optional)</label>
                <input
                  value={newHolding.name}
                  onChange={e => setNewHolding(h => ({ ...h, name: e.target.value }))}
                  placeholder="e.g. Apple Inc."
                  className="w-full bg-input border border-border rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Quantity</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={newHolding.quantity}
                  onChange={e => setNewHolding(h => ({ ...h, quantity: e.target.value }))}
                  placeholder="0.00"
                  className="w-full bg-input border border-border rounded px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => createHolding.mutate({
                  ticker: newHolding.ticker,
                  name: newHolding.name || null,
                  quantity: parseFloat(newHolding.quantity) || 0,
                })}
                disabled={!newHolding.ticker || !newHolding.quantity || createHolding.isPending}
                className="flex-1 bg-primary text-primary-foreground rounded py-2 text-sm hover:opacity-90 disabled:opacity-50"
              >
                Save Holding
              </button>
              <button onClick={() => setShowNewHolding(false)} className="px-4 bg-secondary rounded text-sm hover:bg-accent">
                Cancel
              </button>
            </div>
            {createHolding.isError && (
              <p className="text-xs text-destructive">{(createHolding.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Failed to save holding'}</p>
            )}
          </div>
        )}

        <div className="divide-y divide-border">
          {holdings.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-muted-foreground">
              No holdings yet. Add a ticker to track your positions.
            </div>
          ) : (
            holdings.map((h: StockHolding) => (
              <div key={h.id} className="flex items-center gap-4 px-6 py-4">
                <div className="flex-1">
                  <p className="text-sm font-medium font-mono">{h.ticker}</p>
                  {h.name && <p className="text-xs text-muted-foreground">{h.name}</p>}
                </div>
                {editingHolding?.id === h.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={editingHolding.quantity}
                      onChange={e => setEditingHolding(ed => ed ? { ...ed, quantity: e.target.value } : ed)}
                      className="w-28 bg-input border border-border rounded px-2 py-1 text-sm text-right"
                    />
                    <button
                      onClick={() => updateHolding.mutate({ id: h.id, data: { quantity: parseFloat(editingHolding.quantity) || 0 } })}
                      className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded hover:opacity-90"
                    >
                      Save
                    </button>
                    <button onClick={() => setEditingHolding(null)} className="text-xs text-muted-foreground hover:text-foreground">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="text-sm tabular-nums">{h.quantity.toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
                    <button
                      onClick={() => setEditingHolding({ id: h.id, quantity: String(h.quantity) })}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteHolding.mutate(h.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {/* Tags */}
      <section className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="font-semibold">Tags</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Label transactions for cross-category tracking (trips, projects, people).</p>
          </div>
          <button
            onClick={() => setShowNewTag(true)}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm hover:opacity-90"
          >
            <Plus className="w-4 h-4" /> Add Tag
          </button>
        </div>

        {showNewTag && (
          <div className="px-6 py-4 border-b border-border bg-accent/10 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Name</label>
                <input
                  value={newTag.name}
                  onChange={e => setNewTag(t => ({ ...t, name: e.target.value }))}
                  placeholder="e.g. RoadTrip_Jun"
                  className="w-full bg-input border border-border rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Type</label>
                <select
                  value={newTag.type}
                  onChange={e => setNewTag(t => ({ ...t, type: e.target.value }))}
                  className="w-full bg-input border border-border rounded px-3 py-2 text-sm"
                >
                  {TAG_TYPES.map(tp => <option key={tp} value={tp}>{tp}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Color</label>
                <div className="flex gap-1.5 items-center flex-wrap">
                  {TAG_PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setNewTag(t => ({ ...t, color: c }))}
                      className="w-5 h-5 rounded-full border-2 transition-all"
                      style={{
                        backgroundColor: c,
                        borderColor: newTag.color === c ? 'white' : 'transparent',
                      }}
                    />
                  ))}
                  <input
                    type="color"
                    value={newTag.color}
                    onChange={e => setNewTag(t => ({ ...t, color: e.target.value }))}
                    className="w-6 h-6 rounded cursor-pointer border border-border bg-transparent"
                    title="Custom color"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => createTag.mutate({ name: newTag.name, type: newTag.type, color: newTag.color })}
                disabled={!newTag.name.trim() || createTag.isPending}
                className="flex-1 bg-primary text-primary-foreground rounded py-2 text-sm hover:opacity-90 disabled:opacity-50"
              >
                Save Tag
              </button>
              <button onClick={() => setShowNewTag(false)} className="px-4 bg-secondary rounded text-sm hover:bg-accent">
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="divide-y divide-border">
          {(tags as TagItem[]).length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-muted-foreground">
              No tags yet. Add one or use Seed Tags in Quick Setup.
            </div>
          ) : (
            (tags as TagItem[]).map(t => (
              <div key={t.id} className="flex items-center gap-3 px-6 py-3">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color || '#3b82f6' }} />
                <span className="text-sm font-medium flex-1">{t.name}</span>
                <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-secondary">{t.type}</span>
                <button
                  onClick={() => deleteTag.mutate(t.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  title="Delete tag"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Categories */}
      <section className="bg-card border border-border rounded-xl p-6">
        <h2 className="font-semibold mb-1">Transaction Categories</h2>
        <p className="text-sm text-muted-foreground mb-5">
          Manage the hierarchical category tree used to classify transactions.
          Double-click a name to rename. Click the color dot to recolor.
        </p>
        <CategoriesManager />
      </section>

      {/* Categorization Exemptions */}
      <CategorizationExemptions />

      {/* Info */}
      <section className="bg-card border border-border rounded-xl p-6">
        <h2 className="font-semibold mb-3">About Tally</h2>
        <div className="text-sm text-muted-foreground space-y-1">
          <p>Version 0.1.0 · Local-first · All data on your machine</p>
          <p>AI powered by Ollama (Qwen) · Analytics powered by DuckDB</p>
          <p>100% open-source · No telemetry · No cloud</p>
        </div>
      </section>
        </div>
      )}

      {activeTab === 'checklist' && (
        <div className="max-w-3xl">
          <ChecklistManager />
        </div>
      )}

      {activeTab === 'admin' && (
        <div className="max-w-5xl">
          <AdminTab />
        </div>
      )}
    </div>
  )
}
