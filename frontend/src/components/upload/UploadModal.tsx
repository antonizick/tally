import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { accountsApi, uploadApi } from '@/lib/api'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
}

interface IngestResult {
  batch_id: number | null
  status: string
  needs_mapping_confirmation: boolean
  proposed_mapping: Record<string, string> | null
  fingerprint: string
  headers?: string[]
  sample_rows?: string[][]
  total: number
  imported: number
  duplicates: number
}

const MAPPING_FIELDS = ['date', 'description', 'amount', 'debit', 'credit', 'balance', 'status', 'category']

export default function UploadModal({ open, onClose }: Props) {
  const qc = useQueryClient()
  const [accountId, setAccountId] = useState<number | ''>('')
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<IngestResult | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: accountsApi.list })

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file || !accountId) throw new Error('Select account and file')
      const fd = new FormData()
      fd.append('file', file)
      fd.append('account_id', String(accountId))
      return uploadApi.csv(fd)
    },
    onSuccess: (data: IngestResult) => {
      setResult(data)
      if (data.needs_mapping_confirmation && data.proposed_mapping) {
        setMapping(data.proposed_mapping as Record<string, string>)
      }
      if (data.status === 'complete') {
        qc.invalidateQueries({ queryKey: ['transactions'] })
        qc.invalidateQueries({ queryKey: ['dashboard'] })
      }
    },
    onError: (e: Error) => setError(e.message),
  })

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!file || !accountId) throw new Error('Missing data')
      const fd = new FormData()
      fd.append('file', file)
      fd.append('account_id', String(accountId))
      fd.append('mapping', JSON.stringify(mapping))
      return uploadApi.confirmMapping(fd)
    },
    onSuccess: (data: IngestResult) => {
      setResult(data)
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (e: Error) => setError(e.message),
  })

  const onDrop = useCallback((files: File[]) => {
    if (files[0]) {
      setFile(files[0])
      setResult(null)
      setError(null)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    maxFiles: 1,
  })

  const reset = () => {
    setFile(null)
    setResult(null)
    setError(null)
    setMapping({})
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">Import CSV</h2>
          <button onClick={reset} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Account selector */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Account</label>
            <select
              value={accountId}
              onChange={e => setAccountId(Number(e.target.value))}
              className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Select account…</option>
              {accounts.map((a: { id: number; name: string; type: string }) => (
                <option key={a.id} value={a.id}>{a.name} ({a.type})</option>
              ))}
            </select>
          </div>

          {/* Dropzone */}
          {!result && (
            <div
              {...getRootProps()}
              className={cn(
                'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
                isDragActive ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
              )}
            >
              <input {...getInputProps()} />
              <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
              {file ? (
                <p className="text-sm font-medium">{file.name}</p>
              ) : (
                <>
                  <p className="text-sm font-medium">Drop CSV here or click to browse</p>
                  <p className="text-xs text-muted-foreground mt-1">Bank statements, credit cards, etc.</p>
                </>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-4 py-3">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Mapping confirmation */}
          {result?.needs_mapping_confirmation && result.headers && (
            <div className="space-y-3">
              <p className="text-sm font-medium">Confirm column mapping</p>
              <p className="text-xs text-muted-foreground">
                AI detected this mapping — review and correct if needed.
              </p>
              <div className="space-y-2">
                {MAPPING_FIELDS.map(field => (
                  <div key={field} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-24 text-right capitalize">{field}</span>
                    <select
                      value={mapping[field] || ''}
                      onChange={e => setMapping(m => ({ ...m, [field]: e.target.value }))}
                      className="flex-1 bg-input border border-border rounded px-2 py-1 text-xs"
                    >
                      <option value="">(not mapped)</option>
                      {(result.headers || []).map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => confirmMutation.mutate()}
                  disabled={confirmMutation.isPending}
                  className="flex-1 bg-primary text-primary-foreground rounded-lg py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {confirmMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Confirm & Import
                </button>
              </div>
            </div>
          )}

          {/* Success */}
          {result?.status === 'complete' && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 text-emerald-400 font-medium mb-2">
                <CheckCircle className="w-5 h-5" />
                Import complete
              </div>
              <div className="grid grid-cols-3 gap-3 text-center text-sm">
                <div>
                  <div className="text-lg font-bold">{result.imported}</div>
                  <div className="text-xs text-muted-foreground">Imported</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-muted-foreground">{result.duplicates}</div>
                  <div className="text-xs text-muted-foreground">Duplicates</div>
                </div>
                <div>
                  <div className="text-lg font-bold">{result.total}</div>
                  <div className="text-xs text-muted-foreground">Total</div>
                </div>
              </div>
            </div>
          )}

          {/* Upload button */}
          {!result && (
            <button
              onClick={() => uploadMutation.mutate()}
              disabled={!file || !accountId || uploadMutation.isPending}
              className="w-full bg-primary text-primary-foreground rounded-lg py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2 transition-opacity"
            >
              {uploadMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing & importing…
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Import
                </>
              )}
            </button>
          )}

          {result?.status === 'complete' && (
            <button onClick={reset} className="w-full bg-secondary text-secondary-foreground rounded-lg py-2.5 text-sm font-medium hover:bg-accent transition-colors">
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
