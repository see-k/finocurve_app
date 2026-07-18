const rawEnterpriseUrl = import.meta.env.VITE_FINOCURVE_SERVICE_URL?.trim() ?? ''

export const enterpriseServiceUrl = rawEnterpriseUrl.replace(/\/+$/, '')

export type EnterpriseConnection = {
  product: string
  label: string
  status: 'connected' | 'error' | 'not_configured'
  last_sync?: string | null
  institution_name?: string
  error?: string
}

export type EnterpriseBalanceProduct = {
  product: string
  institution_name?: string
  total_usd: number
  balances: Array<Record<string, unknown>>
  crypto?: Array<{ asset: string; amount: number; product: string }>
  error?: unknown
}

export type EnterpriseBalances = {
  by_product: EnterpriseBalanceProduct[]
  aggregate: { total_usd: number; crypto: Array<{ asset: string; amount: number; product: string }> }
}

export type EnterpriseTransaction = {
  id: string
  date: string
  description: string
  amount: string | number
  type: string
  status: string
  category: string
  counterparty: string
  product: string
  institution: string
  account: string
}

export type BalanceSnapshot = {
  id: number
  total_usd: number
  snapshot_date: string
  source: string
}

export async function enterpriseFetch<T>(path: string, options: { force?: boolean; signal?: AbortSignal } = {}): Promise<T> {
  const { force = false, signal } = options
  if (window.electronAPI?.enterpriseRequest) {
    const result = await window.electronAPI.enterpriseRequest<T>({ url: enterpriseServiceUrl, path, refresh: force })
    if (!result.ok) throw new Error(result.error || `Finocurve Service returned ${result.status ?? 'an error'}`)
    return result.data as T
  }

  const response = await fetch(`${enterpriseServiceUrl}${path}${force ? '?refresh=1' : ''}`, {
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Finocurve Service returned ${response.status}`)
  return response.json() as Promise<T>
}

export function getEnterpriseSource(path: string, label: string) {
  return { label, href: `${enterpriseServiceUrl}${path}` }
}
