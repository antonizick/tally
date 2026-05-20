import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || ''

export const api = axios.create({
  baseURL: BASE,
  headers: { 'Content-Type': 'application/json' },
})

// ---- Accounts ----
export const accountsApi = {
  list: () => api.get('/api/accounts/').then(r => r.data),
  create: (data: Record<string, unknown>) => api.post('/api/accounts/', data).then(r => r.data),
  update: (id: number, data: Record<string, unknown>) => api.patch(`/api/accounts/${id}`, data).then(r => r.data),
  delete: (id: number) => api.delete(`/api/accounts/${id}`).then(r => r.data),
}

// ---- Transactions ----
export const transactionsApi = {
  list: (params: Record<string, unknown>) => api.get('/api/transactions/', { params }).then(r => r.data),
  reviewQueue: () => api.get('/api/transactions/review-queue').then(r => r.data),
  update: (id: number, data: Record<string, unknown>) => api.patch(`/api/transactions/${id}`, data).then(r => r.data),
  bulkApprove: (ids: number[]) => api.post('/api/transactions/bulk-approve', ids).then(r => r.data),
  summary: (params: Record<string, unknown>) => api.get('/api/transactions/summary', { params }).then(r => r.data),
}

// ---- Categories ----
export const categoriesApi = {
  list: (params?: { date_from?: string; date_to?: string }) =>
    api.get('/api/categories/', { params }).then(r => r.data),
  create: (data: Record<string, unknown>) => api.post('/api/categories/', data).then(r => r.data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/api/categories/${id}`, data).then(r => r.data),
  seed: () => api.post('/api/categories/seed').then(r => r.data),
  delete: (id: number, force = false) => api.delete(`/api/categories/${id}`, { params: { force } }).then(r => r.data),
}

// ---- Tags ----
export const tagsApi = {
  list: () => api.get('/api/tags/').then(r => r.data),
  create: (data: Record<string, unknown>) => api.post('/api/tags/', data).then(r => r.data),
  seed: () => api.post('/api/tags/seed').then(r => r.data),
}

// ---- Snapshots ----
export const snapshotsApi = {
  list: () => api.get('/api/snapshots/').then(r => r.data),
  latest: () => api.get('/api/snapshots/latest').then(r => r.data),
  get: (id: number) => api.get(`/api/snapshots/${id}`).then(r => r.data),
  create: (data: Record<string, unknown>) => api.post('/api/snapshots/', data).then(r => r.data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/api/snapshots/${id}`, data).then(r => r.data),
  delete: (id: number) => api.delete(`/api/snapshots/${id}`).then(r => r.data),
  stockPrice: (ticker: string) => api.get(`/api/snapshots/stock-price/${ticker}`).then(r => r.data),
}

// ---- Net Worth ----
export const netWorthApi = {
  views: () => api.get('/api/net-worth/views').then(r => r.data),
  calculate: (snapshotId?: number) => api.get('/api/net-worth/calculate', { params: { snapshot_id: snapshotId } }).then(r => r.data),
  trend: () => api.get('/api/net-worth/trend').then(r => r.data),
  detailTrend: () => api.get('/api/net-worth/detail-trend').then(r => r.data),
  seedViews: () => api.post('/api/net-worth/seed-views').then(r => r.data),
  createView: (data: Record<string, unknown>) => api.post('/api/net-worth/views', data).then(r => r.data),
}

// ---- Dashboard ----
export const dashboardApi = {
  summary: (params: { date_from?: string; date_to?: string; months?: number; show_quiet?: boolean } = {}) =>
    api.get('/api/dashboard/summary', { params }).then(r => r.data),
}

// ---- Reports ----
export const reportsApi = {
  spendingByCategory: (params: Record<string, unknown>) => api.get('/api/reports/spending-by-category', { params }).then(r => r.data),
  monthlyTrend: (params: Record<string, unknown>) => api.get('/api/reports/monthly-trend', { params }).then(r => r.data),
  pivot: (params: Record<string, unknown>) => api.get('/api/reports/pivot', { params }).then(r => r.data),
}

// ---- Display Config ----
export const displayConfigApi = {
  get: () => api.get('/api/display-config/').then(r => r.data),
  save: (data: { asset_order: string[]; liability_order: string[] }) =>
    api.put('/api/display-config/', data).then(r => r.data),
}

// ---- Stock Holdings ----
export const stockHoldingsApi = {
  list: () => api.get('/api/stock-holdings/').then(r => r.data),
  create: (data: Record<string, unknown>) => api.post('/api/stock-holdings/', data).then(r => r.data),
  update: (id: number, data: Record<string, unknown>) => api.patch(`/api/stock-holdings/${id}`, data).then(r => r.data),
  delete: (id: number) => api.delete(`/api/stock-holdings/${id}`).then(r => r.data),
  portfolioTrend: () => api.get('/api/stock-holdings/portfolio-trend').then(r => r.data),
}

// ---- Upload ----
export const uploadApi = {
  csv: (formData: FormData) => api.post('/api/upload/csv', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data),
  confirmMapping: (formData: FormData) => api.post('/api/upload/csv/confirm-mapping', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data),
}

// ---- Admin ----
export const adminApi = {
  backup: () => api.post('/api/admin/backup').then(r => r.data),
  listBackups: () => api.get('/api/admin/backups').then(r => r.data),
  downloadUrl: (filename: string) => `${BASE}/api/admin/backup/download/${encodeURIComponent(filename)}`,
  restore: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post('/api/admin/restore', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data)
  },
  reset: () => api.post('/api/admin/reset').then(r => r.data),
}
