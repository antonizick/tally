import { create } from 'zustand'
import { getFirstLastOfMonth } from '@/lib/utils'

const { start, end } = getFirstLastOfMonth(0)

interface DashboardDatesStore {
  dateFrom: string
  dateTo: string
  setDateFrom: (d: string) => void
  setDateTo: (d: string) => void
}

export const useDashboardDates = create<DashboardDatesStore>(set => ({
  dateFrom: start,
  dateTo: end,
  setDateFrom: d => set({ dateFrom: d }),
  setDateTo: d => set({ dateTo: d }),
}))
