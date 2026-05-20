import { useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bell, Upload } from 'lucide-react'
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

  const { data: reviewData } = useQuery({
    queryKey: ['review-queue-count'],
    queryFn: () => transactionsApi.reviewQueue(),
    refetchInterval: 60_000,
  })

  const pendingCount = reviewData?.pending_count ?? 0

  return (
    <>
      <header className="h-14 border-b border-border bg-card px-6 flex items-center justify-between shrink-0">
        <h1 className="text-lg font-semibold">{title}</h1>

        <div className="flex items-center gap-3">
          {pendingCount > 0 && (
            <a
              href="/transactions?review_status=pending"
              className="flex items-center gap-1.5 text-sm text-yellow-400 bg-yellow-400/10 px-3 py-1.5 rounded-full hover:bg-yellow-400/20 transition-colors"
            >
              <Bell className="w-3.5 h-3.5" />
              {pendingCount} pending review
            </a>
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

      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </>
  )
}
