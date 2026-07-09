import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Plus, Trash2 } from 'lucide-react'
import { categorizationConfigApi } from '@/lib/api'

interface CategorizationConfig {
  exemptions: string[]
}

export default function CategorizationExemptions() {
  const qc = useQueryClient()
  const [newExemption, setNewExemption] = useState('')

  const { data } = useQuery<CategorizationConfig>({
    queryKey: ['categorization-config'],
    queryFn: categorizationConfigApi.get,
  })
  const exemptions = data?.exemptions ?? []

  const save = useMutation({
    mutationFn: (next: string[]) => categorizationConfigApi.save({ exemptions: next }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categorization-config'] }),
  })

  const addExemption = () => {
    const value = newExemption.trim()
    if (!value || exemptions.includes(value)) return
    save.mutate([...exemptions, value], {
      onSuccess: () => setNewExemption(''),
    })
  }

  const removeExemption = (value: string) => {
    save.mutate(exemptions.filter(e => e !== value))
  }

  return (
    <section className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <h2 className="font-semibold">Auto-Categorization Exemptions</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Transactions whose description contains any of these strings (case-insensitive) are
          never auto-categorized — by rules or AI. Use this for accounts like a shared payment
          processor whose category can't be predicted from the description.
        </p>
      </div>

      <div className="px-6 py-4 border-b border-border bg-accent/10 flex gap-2">
        <input
          value={newExemption}
          onChange={e => setNewExemption(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addExemption()}
          placeholder="e.g. PWP*Privacy"
          className="flex-1 bg-input border border-border rounded px-3 py-2 text-sm"
        />
        <button
          onClick={addExemption}
          disabled={!newExemption.trim() || save.isPending}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm hover:opacity-90 disabled:opacity-50"
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      {save.isError && (
        <div className="flex gap-2 items-start bg-destructive/10 text-destructive px-6 py-3 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>Failed to save: {String(save.error)}</span>
        </div>
      )}

      <div className="divide-y divide-border">
        {exemptions.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-muted-foreground">
            No exemptions yet. Everything is eligible for auto-categorization.
          </div>
        ) : (
          exemptions.map(value => (
            <div key={value} className="flex items-center gap-3 px-6 py-3">
              <span className="text-sm font-mono flex-1">{value}</span>
              <button
                onClick={() => removeExemption(value)}
                disabled={save.isPending}
                className="text-muted-foreground hover:text-destructive transition-colors"
                title="Remove exemption"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
