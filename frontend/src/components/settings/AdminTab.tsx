import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Archive, Download } from 'lucide-react'
import { adminApi } from '@/lib/api'

interface BackupEntry {
  filename: string
  filesize_bytes: number
  modified_at: string
  label: string
}

export default function AdminTab() {
  const qc = useQueryClient()

  // Backup state
  const [backupLabel, setBackupLabel] = useState('')
  const [backupResult, setBackupResult] = useState<{
    filename: string
    filesize_bytes: number
    timestamp: string
    label: string
  } | null>(null)

  // Restore state
  const [restoreFile, setRestoreFile] = useState<File | null>(null)
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false)
  const [restoreSuccess, setRestoreSuccess] = useState(false)

  // Reset state
  const [showResetDialog1, setShowResetDialog1] = useState(false)
  const [showResetDialog2, setShowResetDialog2] = useState(false)
  const [resetConfirmText, setResetConfirmText] = useState('')
  const [resetSuccess, setResetSuccess] = useState(false)

  // Backup history
  const { data: backups = [] } = useQuery<BackupEntry[]>({
    queryKey: ['admin-backups'],
    queryFn: adminApi.listBackups,
  })

  // Mutations
  const backupMutation = useMutation({
    mutationFn: () => adminApi.backup(backupLabel.trim() || undefined),
    onSuccess: (data) => {
      setBackupResult(data)
      setBackupLabel('')
      qc.invalidateQueries({ queryKey: ['admin-backups'] })
    },
  })

  const restoreMutation = useMutation({
    mutationFn: (file: File) => adminApi.restore(file),
    onSuccess: () => {
      setRestoreSuccess(true)
      setRestoreFile(null)
      setShowRestoreConfirm(false)
      qc.invalidateQueries()
    },
  })

  const resetMutation = useMutation({
    mutationFn: adminApi.reset,
    onSuccess: () => {
      setResetSuccess(true)
      setShowResetDialog2(false)
      setResetConfirmText('')
      qc.invalidateQueries()
    },
  })

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
  }

  const formatDate = (isoString: string): string => {
    return new Date(isoString).toLocaleString()
  }

  return (
    <div className="flex gap-6 items-start">
      {/* Left column: action cards */}
      <div className="flex-1 min-w-0 space-y-6">

        {/* Backup Card */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-lg">Backup</h3>
          <p className="text-sm text-muted-foreground">
            Create a complete backup of your data including all accounts, transactions, and settings.
          </p>
          {!backupResult && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Backup name (optional)</label>
                <input
                  type="text"
                  value={backupLabel}
                  onChange={e => setBackupLabel(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !backupMutation.isPending && backupMutation.mutate()}
                  placeholder="e.g. Before migration"
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <button
                onClick={() => backupMutation.mutate()}
                disabled={backupMutation.isPending}
                className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {backupMutation.isPending ? 'Creating backup...' : 'Create Backup'}
              </button>
            </div>
          )}
          {backupMutation.isError && (
            <div className="flex gap-2 items-start bg-destructive/10 text-destructive p-3 rounded-lg text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{String(backupMutation.error)}</span>
            </div>
          )}
          {backupResult && (
            <div className="space-y-3">
              <div className="bg-muted p-3 rounded-lg space-y-2">
                {backupResult.label && (
                  <div className="text-sm font-medium">{backupResult.label}</div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-mono truncate">{backupResult.filename}</span>
                  <a
                    href={adminApi.downloadUrl(backupResult.filename)}
                    download={backupResult.filename}
                    className="bg-secondary text-foreground px-3 py-1.5 rounded text-xs font-medium hover:bg-secondary/80 flex items-center gap-1 whitespace-nowrap ml-2"
                  >
                    <Download className="w-3 h-3" />
                    Download
                  </a>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>Size: {formatBytes(backupResult.filesize_bytes)}</div>
                  <div>Created: {formatDate(backupResult.timestamp)}</div>
                </div>
              </div>
              <button
                onClick={() => setBackupResult(null)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Create another backup
              </button>
            </div>
          )}
        </div>

        {/* Restore Card */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-lg">Restore</h3>
          <p className="text-sm text-muted-foreground">
            Restore your data from a previously created backup file (.tar.gz).
          </p>
          {!restoreSuccess && (
            <div className="space-y-3">
              <div>
                <input
                  type="file"
                  accept=".tar.gz"
                  onChange={(e) => {
                    setRestoreFile(e.target.files?.[0] ?? null)
                  }}
                  className="hidden"
                  id="restore-file-input"
                />
                <label
                  htmlFor="restore-file-input"
                  className="inline-block bg-secondary text-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-secondary/80 cursor-pointer"
                >
                  {restoreFile ? restoreFile.name : 'Choose .tar.gz file'}
                </label>
              </div>
              <button
                onClick={() => setShowRestoreConfirm(true)}
                disabled={!restoreFile || restoreMutation.isPending}
                className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {restoreMutation.isPending ? 'Restoring...' : 'Restore from Backup'}
              </button>
              {restoreMutation.isError && (
                <div className="flex gap-2 items-start bg-destructive/10 text-destructive p-3 rounded-lg text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{String(restoreMutation.error)}</span>
                </div>
              )}
            </div>
          )}
          {restoreSuccess && (
            <div className="bg-green-50 dark:bg-green-950 text-green-900 dark:text-green-100 p-3 rounded-lg text-sm">
              ✓ Restore completed successfully. All data has been recovered.
            </div>
          )}
        </div>

        {/* Reset Card */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-lg">Factory Reset</h3>
          <p className="text-sm text-muted-foreground">
            Erase all data and reset the database to a clean state with sample data. This action cannot be undone.
          </p>
          {!resetSuccess && (
            <button
              onClick={() => setShowResetDialog1(true)}
              disabled={resetMutation.isPending}
              className="bg-destructive text-destructive-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {resetMutation.isPending ? 'Resetting...' : 'Reset to Factory Defaults'}
            </button>
          )}
          {resetSuccess && (
            <div className="bg-green-50 dark:bg-green-950 text-green-900 dark:text-green-100 p-3 rounded-lg text-sm">
              ✓ Database has been reset to factory defaults with sample data.
            </div>
          )}
        </div>

      </div>

      {/* Right column: backup history */}
      <div className="w-72 flex-shrink-0">
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Archive className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold">Backup History</h3>
          </div>
          {backups.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No backups yet</p>
          ) : (
            <ol className="space-y-3">
              {backups.map((b, idx) => (
                <li key={b.filename} className="flex items-start gap-2 text-sm">
                  <span className="text-xs text-muted-foreground font-mono w-5 flex-shrink-0 pt-0.5 text-right">
                    {idx + 1}.
                  </span>
                  <div className="flex-1 min-w-0">
                    {b.label ? (
                      <div className="font-medium truncate" title={b.label}>{b.label}</div>
                    ) : (
                      <div className="font-mono text-xs truncate text-muted-foreground" title={b.filename}>
                        {b.filename}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(b.modified_at)}
                    </div>
                    <div className="text-xs text-muted-foreground">{formatBytes(b.filesize_bytes)}</div>
                  </div>
                  <a
                    href={adminApi.downloadUrl(b.filename)}
                    download={b.label ? `${b.label}.tar.gz` : b.filename}
                    className="text-muted-foreground hover:text-foreground flex-shrink-0 pt-0.5"
                    title="Download"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {/* Restore Confirmation Dialog */}
      {showRestoreConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <h3 className="font-semibold text-lg">Restore from Backup?</h3>
            <p className="text-sm text-muted-foreground">
              This will replace all your current data with data from the backup file. All unsaved changes will be lost.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowRestoreConfirm(false)}
                className="flex-1 bg-secondary text-foreground rounded-lg py-2 text-sm font-medium hover:bg-secondary/80"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (restoreFile) {
                    restoreMutation.mutate(restoreFile)
                  }
                }}
                className="flex-1 bg-primary text-primary-foreground rounded-lg py-2 text-sm font-medium hover:opacity-90"
              >
                Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Confirmation Dialog 1 */}
      {showResetDialog1 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold">Reset to Factory Defaults?</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  This will permanently erase ALL your data and reset the database to a clean state. This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowResetDialog1(false)}
                className="flex-1 bg-secondary text-foreground rounded-lg py-2 text-sm font-medium hover:bg-secondary/80"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowResetDialog1(false)
                  setShowResetDialog2(true)
                }}
                className="flex-1 bg-destructive text-destructive-foreground rounded-lg py-2 text-sm font-medium hover:opacity-90"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Confirmation Dialog 2 */}
      {showResetDialog2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <h3 className="font-semibold">Confirm Reset</h3>
            <p className="text-sm text-muted-foreground">
              Type <span className="font-mono bg-muted px-1 rounded">RESET</span> below to confirm this action.
            </p>
            <input
              type="text"
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              placeholder="Type RESET to confirm"
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowResetDialog2(false)
                  setResetConfirmText('')
                }}
                className="flex-1 bg-secondary text-foreground rounded-lg py-2 text-sm font-medium hover:bg-secondary/80"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  resetMutation.mutate()
                }}
                disabled={resetConfirmText !== 'RESET' || resetMutation.isPending}
                className="flex-1 bg-destructive text-destructive-foreground rounded-lg py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {resetMutation.isPending ? 'Resetting...' : 'Reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
