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
  status: 'needs_mapping' | 'preview' | 'complete'
  needs_mapping_confirmation: boolean
  proposed_mapping: Record<string, string> | null
  fingerprint: string
  headers?: string[]
  sample_rows?: string[][]
  total: number
  parsed?: number
  after_cutoff?: number
  imported: number
  duplicates: number
}

const MAPPING_FIELDS = ['date', 'description', 'amount', 'debit', 'credit', 'balance', 'status', 'category']

export default function UploadModal({ open, onClose }: Props) {
  const qc = useQueryClient()
  const [accountId, setAccountId] = useState<number | ''>('')
  const [file, setFile] = useState<File | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [result, setResult] = useState<IngestResult | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: accountsApi.list })

  const buildUploadForm = (preview: boolean) => {
    if (!file || !accountId) throw new Error('Select account and file')
    const fd = new FormData()
    fd.append('file', file)
    fd.append('account_id', String(accountId))
    if (dateFrom) fd.append('date_from', dateFrom)
    fd.append('preview', String(preview))
    return fd
  }

  const buildConfirmForm = (preview: boolean) => {
    if (!file || !accountId) throw new Error('Missing data')
    const fd = new FormData()
    fd.append('file', file)
    fd.append('account_id', String(accountId))
    fd.append('mapping', JSON.stringify(mapping))
    if (dateFrom) fd.append('date_from', dateFrom)
    fd.append('preview', String(preview))
    return fd
  }

  const onIngestResult = (data: IngestResult) => {
    setResult(data)
    if (data.proposed_mapping) setMapping(data.proposed_mapping)
  }

  // Step 1: analyze the file and either surface a mapping to confirm, or go
  // straight to a preview of what this import would do.
  const previewMutation = useMutation({
    mutationFn: () => uploadApi.csv(buildUploadForm(true)),
    onSuccess: onIngestResult,
    onError: (e: Error) => setError(e.message),
  })

  // Step 2 (only if mapping needed confirming): re-run the preview with the
  // user-confirmed mapping.
  const confirmPreviewMutation = useMutation({
    mutationFn: () => uploadApi.confirmMapping(buildConfirmForm(true)),
    onSuccess: onIngestResult,
    onError: (e: Error) => setError(e.message),
  })

  // Step 3: commit the import using the exact mapping the preview was based on.
  const commitMutation = useMutation({
    mutationFn: () => uploadApi.confirmMapping(buildConfirmForm(false)),
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
    setDateFrom('')
    setResult(null)
    setError(null)
    setMapping({})
    onClose()
  }

  const backToOptions = () => {
    setResult(null)
    setError(null)
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

          {/* Date cutoff */}
          {!result && (
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Only import transactions on or after <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          )}

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
                  onClick={() => confirmPreviewMutation.mutate()}
                  disabled={confirmPreviewMutation.isPending}
                  className="flex-1 bg-primary text-primary-foreground rounded-lg py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {confirmPreviewMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Confirm & Preview
                </button>
              </div>
            </div>
          )}

          {/* Preview / confirm counts */}
          {result?.status === 'preview' && (
            <div className="bg-accent/10 border border-border rounded-xl p-4 space-y-4">
              <p className="text-sm font-medium">Ready to import — review before continuing</p>
              <div className="grid grid-cols-2 gap-3 text-center text-sm">
                <div>
                  <div className="text-lg font-bold">{result.total}</div>
                  <div className="text-xs text-muted-foreground">Records total</div>
                </div>
                <div>
                  <div className="text-lg font-bold">{result.after_cutoff ?? result.total}</div>
                  <div className="text-xs text-muted-foreground">Met date cutoff</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-muted-foreground">{result.duplicates}</div>
                  <div className="text-xs text-muted-foreground">Duplicates</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-emerald-400">{result.imported}</div>
                  <div className="text-xs text-muted-foreground">Will import</div>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={backToOptions}
                  className="px-4 bg-secondary text-secondary-foreground rounded-lg py-2 text-sm font-medium hover:bg-accent transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => commitMutation.mutate()}
                  disabled={commitMutation.isPending || result.imported === 0}
                  className="flex-1 bg-primary text-primary-foreground rounded-lg py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {commitMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Import {result.imported} Transaction{result.imported === 1 ? '' : 's'}
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

          {/* Analyze button */}
          {!result && (
            <button
              onClick={() => previewMutation.mutate()}
              disabled={!file || !accountId || previewMutation.isPending}
              className="w-full bg-primary text-primary-foreground rounded-lg py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2 transition-opacity"
            >
              {previewMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing…
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Preview Import
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
