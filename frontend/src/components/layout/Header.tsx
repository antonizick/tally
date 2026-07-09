import { useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, Check, Upload } from 'lucide-react'
import { transactionsApi } from '@/lib/api'
import UploadModal from '@/components/upload/UploadModal'
import { useState } from 'react'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/transactions': 'Transactions',
  '/assets': 'Assets & Liabilities',
  '/reports': 'Reports & Pivots',
  '/settings': 'Settings',
}

export default function Header() {
  const location = useLocation()
  const title = PAGE_TITLES[location.pathname] || 'Tally'
  const [uploadOpen, setUploadOpen] = useState(false)
  const [showAcceptConfirm, setShowAcceptConfirm] = useState(false)
  const qc = useQueryClient()

  const { data: reviewData } = useQuery({
    queryKey: ['review-queue-count'],
    queryFn: () => transactionsApi.reviewQueue(),
    refetchInterval: 60_000,
  })

  const pendingCount = reviewData?.pending_count ?? 0

  const acceptAllMutation = useMutation({
    mutationFn: () => transactionsApi.approveAllPending(),
    onSuccess: () => {
      setShowAcceptConfirm(false)
      qc.invalidateQueries({ queryKey: ['review-queue-count'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
    },
  })

  return (
    <>
      <header className="h-14 border-b border-border bg-card px-6 flex items-center justify-between shrink-0">
        <h1 className="text-lg font-semibold">{title}</h1>

        <div className="flex items-center gap-3">
          {pendingCount > 0 && (
            <div className="flex items-center gap-1.5 bg-yellow-400/10 rounded-full pl-3 pr-1.5 py-1.5">
              <a
                href="/transactions?review_status=pending"
                className="flex items-center gap-1.5 text-sm text-yellow-400 hover:opacity-80 transition-opacity"
              >
                <Bell className="w-3.5 h-3.5" />
                {pendingCount} pending review
              </a>
              <button
                onClick={() => setShowAcceptConfirm(true)}
                title="Accept all pending categories as-is"
                className="flex items-center gap-1 text-xs text-yellow-400 bg-yellow-400/10 hover:bg-yellow-400/20 rounded-full px-2 py-1 transition-colors"
              >
                <Check className="w-3 h-3" />
                Accept All
              </button>
            </div>
          )}

          <button
            onClick={() => setUploadOpen(true)}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Upload className="w-4 h-4" />
            Import CSV
          </button>
        </div>
      </header>

      {showAcceptConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <h3 className="font-semibold text-lg">Accept all pending categories?</h3>
            <p className="text-sm text-muted-foreground">
              This marks all {pendingCount} currently pending transactions as reviewed, using
              their category as-is. It won't change any categories — it just confirms you've
              looked them over. Transactions imported after this point will still start pending
              as usual.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowAcceptConfirm(false)}
                className="flex-1 bg-secondary text-foreground rounded-lg py-2 text-sm font-medium hover:bg-secondary/80"
              >
                Cancel
              </button>
              <button
                onClick={() => acceptAllMutation.mutate()}
                disabled={acceptAllMutation.isPending}
                className="flex-1 bg-primary text-primary-foreground rounded-lg py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {acceptAllMutation.isPending ? 'Accepting…' : 'Accept All'}
              </button>
            </div>
          </div>
        </div>
      )}

      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </>
  )
}
