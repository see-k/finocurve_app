import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Building2, Camera, CircleDollarSign, Coins, Database, ExternalLink, FileText, RefreshCw, ScrollText, Search, ShieldCheck } from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  enterpriseFetch, getEnterpriseSource, type BalanceSnapshot, type EnterpriseBalances,
  type EnterpriseConnection, type EnterpriseTransaction,
} from '../../services/enterprise'
import './EnterpriseScreen.css'

type EnterprisePage = 'overview' | 'balances' | 'transactions' | 'connections'
type TransactionsResponse = { by_product: Array<{ product: string; institution_name?: string; account_name?: string; transactions?: Omit<EnterpriseTransaction, 'product' | 'institution' | 'account'>[]; error?: unknown }> }

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const compactMoney = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })
const quantity = new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 })
const productNames: Record<string, string> = { teller: 'Teller', schwab: 'Charles Schwab', coinbase: 'Coinbase', alpaca: 'Alpaca', binance_us: 'Binance US', kalshi: 'Kalshi' }
const reportDownloads = [
  { path: '/api/reports/balances.pdf', title: 'Balances report', detail: 'Consolidated balance summary (PDF)' },
  { path: '/api/reports/transactions.pdf', title: 'Transactions report', detail: 'Institutional activity export (PDF)' },
  { path: '/api/reports/combined.pdf', title: 'Combined report', detail: 'Balances and activity in one document (PDF)' },
]
const monthLabel = (month: string) => new Date(`${month}-01T00:00:00`).toLocaleDateString('en-US', { month: 'short' })
const categoryLabel = (category: string) => category.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
const ENTERPRISE_BANNER_BG = 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=1287&auto=format&fit=crop'

function Citation({ path, label }: { path: string; label: string }) {
  const source = getEnterpriseSource(path, label)
  return <a className="enterprise-citation" href={source.href} target="_blank" rel="noreferrer">{source.label}<ExternalLink size={11} /></a>
}

export default function EnterpriseScreen() {
  const [page, setPage] = useState<EnterprisePage>('overview')
  const [balances, setBalances] = useState<EnterpriseBalances | null>(null)
  const [history, setHistory] = useState<BalanceSnapshot[] | null>(null)
  const [connections, setConnections] = useState<EnterpriseConnection[] | null>(null)
  const [transactions, setTransactions] = useState<EnterpriseTransaction[] | null>(null)
  const [transactionIssues, setTransactionIssues] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [txQuery, setTxQuery] = useState('')
  const [txInstitution, setTxInstitution] = useState('all')
  const [snapshotting, setSnapshotting] = useState(false)
  const requestSeq = useRef(0)

  const load = useCallback(async (target: EnterprisePage, force = false) => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError('')
    try {
      if (target === 'overview' || target === 'balances') {
        const needBalances = force || !balances
        const needHistory = target === 'overview' && (force || history === null)
        const [nextBalances, nextHistory] = await Promise.all([
          needBalances ? enterpriseFetch<EnterpriseBalances>('/api/reports/balances', { force }) : null,
          needHistory ? enterpriseFetch<{ history: BalanceSnapshot[] }>('/api/balance-history') : null,
        ])
        if (seq !== requestSeq.current) return
        if (nextBalances) setBalances(nextBalances)
        if (nextHistory) setHistory(nextHistory.history ?? [])
      } else if (target === 'connections' && (force || connections === null)) {
        const data = await enterpriseFetch<{ products: EnterpriseConnection[] }>('/api/health/connections', { force })
        if (seq !== requestSeq.current) return
        setConnections(data.products ?? [])
      } else if (target === 'transactions' && (force || transactions === null)) {
        const data = await enterpriseFetch<TransactionsResponse>('/api/reports/transactions', { force })
        if (seq !== requestSeq.current) return
        const groups = data.by_product ?? []
        setTransactionIssues(groups.filter(group => group.error).map(group => `${group.institution_name ?? productNames[group.product] ?? group.product}: provider request failed`))
        setTransactions(groups.flatMap(group => (group.transactions ?? []).map(transaction => ({
          ...transaction, product: group.product, institution: group.institution_name ?? '—', account: group.account_name ?? '—',
        }))))
      }
    } catch (reason) {
      if (seq !== requestSeq.current) return
      setError(reason instanceof Error ? reason.message : 'Enterprise data could not be loaded.')
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }, [balances, connections, history, transactions])

  useEffect(() => { void load(page) }, [page])

  const connectedCount = (connections ?? []).filter(item => item.status === 'connected').length
  const chartData = useMemo(() => Array.from((history ?? []).reduce((days, item) => {
    const existing = days.get(item.snapshot_date)
    if (!existing || Number(item.id) > Number(existing.id)) days.set(item.snapshot_date, item)
    return days
  }, new Map<string, BalanceSnapshot>()).values()).map(item => ({ date: item.snapshot_date, total: Number(item.total_usd) })).sort((a, b) => a.date.localeCompare(b.date)), [history])
  const products = balances?.by_product ?? []
  const reportingProducts = products.filter(product => !product.error && product.total_usd > 0)
  const cryptoHoldings = balances?.aggregate.crypto ?? []
  const pageDataReady = page === 'transactions' ? transactions !== null : page === 'connections' ? connections !== null : balances !== null

  const cashFlow = useMemo(() => {
    const months = new Map<string, { inflow: number; outflow: number }>()
    for (const transaction of transactions ?? []) {
      const amount = Number(transaction.amount) || 0
      const month = (transaction.date || '').slice(0, 7)
      if (!/^\d{4}-\d{2}$/.test(month)) continue
      const entry = months.get(month) ?? { inflow: 0, outflow: 0 }
      if (amount >= 0) entry.inflow += amount
      else entry.outflow += -amount
      months.set(month, entry)
    }
    return Array.from(months.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([month, totals]) => ({ month, inflow: Math.round(totals.inflow * 100) / 100, outflow: Math.round(totals.outflow * 100) / 100 }))
  }, [transactions])

  const topCategories = useMemo(() => {
    const totals = new Map<string, number>()
    for (const transaction of transactions ?? []) {
      const amount = Number(transaction.amount) || 0
      if (amount >= 0) continue
      const category = transaction.category || 'uncategorized'
      totals.set(category, (totals.get(category) ?? 0) + -amount)
    }
    return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [transactions])

  const institutions = useMemo(() =>
    Array.from(new Set((transactions ?? []).map(transaction => transaction.institution).filter(name => name && name !== '—'))).sort(),
  [transactions])

  const visibleTransactions = useMemo(() => {
    const query = txQuery.trim().toLowerCase()
    return (transactions ?? []).filter(transaction =>
      (txInstitution === 'all' || transaction.institution === txInstitution) &&
      (!query || [transaction.description, transaction.counterparty, transaction.category, transaction.account, transaction.institution].join(' ').toLowerCase().includes(query)))
  }, [transactions, txQuery, txInstitution])

  const recordSnapshot = useCallback(async () => {
    setSnapshotting(true)
    setError('')
    try {
      await enterpriseFetch('/api/balance-history/snapshot', { method: 'POST' })
      const data = await enterpriseFetch<{ history: BalanceSnapshot[] }>('/api/balance-history')
      setHistory(data.history ?? [])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Snapshot could not be recorded.')
    } finally {
      setSnapshotting(false)
    }
  }, [])

  const connectionMessage = (connection: EnterpriseConnection) => {
    if (!connection.error) return connection.last_sync ? `Last checked ${new Date(connection.last_sync).toLocaleString()}` : 'Awaiting configuration'
    return String(connection.error).toLowerCase().includes('rate limit') ? 'Provider rate limit reached. Try again later.' : 'Provider request failed. Try again later.'
  }

  return (
    <div className="enterprise-screen">
      <section className="enterprise-banner" aria-label="Enterprise overview">
        <img src={ENTERPRISE_BANNER_BG} alt="" />
        <div className="enterprise-banner-content">
          <span className="enterprise-eyebrow"><Building2 size={13} /> Enterprise</span>
          <h1>Institutional intelligence</h1>
          <p>Consolidated balances, activity, and connection health from Finocurve Service.</p>
        </div>
      </section>
      <header className="enterprise-header">
        <button className="enterprise-refresh" onClick={() => void load(page, true)} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''} />Refresh</button>
      </header>

      <nav className="enterprise-tabs" aria-label="Enterprise pages">
        {([['overview', 'Overview'], ['balances', 'Balances'], ['transactions', 'Transactions'], ['connections', 'Connections']] as const).map(([id, label]) => (
          <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}>{label}</button>
        ))}
      </nav>

      {error && <div className="enterprise-error"><Database size={18} /><div><strong>Service data unavailable</strong><span>{error}</span></div><button onClick={() => void load(page, true)}>Try again</button></div>}
      {loading && !pageDataReady ? <div className="enterprise-loading"><RefreshCw className="spin" />Loading enterprise data…</div> : null}

      {page === 'overview' && balances && <>
        <section className="enterprise-kpis">
          <article><span>Consolidated balance</span><strong>{money.format(balances?.aggregate.total_usd ?? 0)}</strong><small>Across {reportingProducts.length} funded sources <Citation path="/api/reports/balances" label="Balance report" /></small></article>
          <article className="enterprise-kpi-action" onClick={() => setPage('connections')}><span>Connection health</span><strong>{connections?.length ? `${connectedCount} connected` : 'View status'}</strong><small>Loaded only when requested to reduce provider traffic</small></article>
          <article className="enterprise-kpi-action" onClick={() => setPage('transactions')}><span>Institutional activity</span><strong>{transactions?.length ? transactions.length.toLocaleString() : 'View activity'}</strong><small>Transactions load separately from balances</small></article>
        </section>
        <section className="enterprise-grid">
          <article className="enterprise-card enterprise-chart-card"><div className="enterprise-card-title"><div><span>Balance history</span><small>Recorded consolidated value over time</small></div><div className="enterprise-chart-actions"><button className="enterprise-snapshot" onClick={() => void recordSnapshot()} disabled={snapshotting}><Camera size={13} />{snapshotting ? 'Recording…' : 'Record snapshot'}</button><Activity size={18} /></div></div>
            {chartData.length ? <ResponsiveContainer width="100%" height={260}><AreaChart data={chartData} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}><defs><linearGradient id="enterpriseArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--brand-primary)" stopOpacity={0.4}/><stop offset="100%" stopColor="var(--brand-primary)" stopOpacity={0.02}/></linearGradient></defs><CartesianGrid stroke="var(--divider)" vertical={false}/><XAxis dataKey="date" tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} axisLine={false} tickLine={false}/><YAxis tickFormatter={value => compactMoney.format(value)} tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} axisLine={false} tickLine={false} width={70}/><Tooltip contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--divider)', borderRadius: 8 }} labelStyle={{ color: 'var(--text-secondary)' }} formatter={value => money.format(Number(value))}/><Area type="monotone" dataKey="total" stroke="var(--brand-primary)" strokeWidth={2} fill="url(#enterpriseArea)" /></AreaChart></ResponsiveContainer> : <div className="enterprise-empty">No balance snapshots yet.</div>}
            <p className="enterprise-description">This series reflects persisted daily and manual snapshots—not estimated market performance. <Citation path="/api/balance-history" label="Balance history" /></p>
          </article>
          <article className="enterprise-card"><div className="enterprise-card-title"><div><span>Source allocation</span><small>Funded sources with successfully reported USD value</small></div><CircleDollarSign size={18} /></div><div className="enterprise-allocation">{reportingProducts.map(product => { const share = balances?.aggregate.total_usd ? Math.max(2, product.total_usd / balances.aggregate.total_usd * 100) : 2; return <div key={`${product.product}-${product.institution_name ?? ''}`}><div><span>{product.institution_name ?? productNames[product.product] ?? product.product}</span><strong>{money.format(product.total_usd)}</strong></div><i><b style={{ width: `${share}%` }} /></i></div> })}</div></article>
        </section>
        <section className="enterprise-card enterprise-stack-card"><div className="enterprise-card-title"><div><span>Reports &amp; documents</span><small>Generated on demand by Finocurve Service</small></div><FileText size={18} /></div>
          <div className="enterprise-report-links">{reportDownloads.map(report => { const source = getEnterpriseSource(report.path, report.title); return <a key={report.path} href={source.href} target="_blank" rel="noreferrer"><FileText size={15} /><span><strong>{report.title}</strong><small>{report.detail}</small></span><ExternalLink size={12} /></a> })}</div>
          <p className="enterprise-description">Documents are rendered live from current provider data — the first open after a quiet period can take a few seconds.</p>
        </section>
      </>}

      {page === 'balances' && balances && <section className="enterprise-card"><div className="enterprise-card-title"><div><span>Balances by source</span><small>Cash and portfolio values returned by connected products</small></div><Citation path="/api/reports/balances" label="Balance report" /></div><div className="enterprise-table-wrap"><table><thead><tr><th>Product</th><th>Institution</th><th>Accounts</th><th>Status</th><th className="numeric">Reported value</th></tr></thead><tbody>{products.map((product, index) => <tr key={`${product.product}-${index}`}><td>{productNames[product.product] ?? product.product}</td><td>{product.institution_name ?? '—'}</td><td>{product.balances.length}</td><td><span className={`status ${product.error ? 'error' : 'connected'}`}>{product.error ? 'Issue' : 'Reporting'}</span></td><td className="numeric"><strong>{money.format(product.total_usd)}</strong></td></tr>)}</tbody></table></div><p className="enterprise-description">Values are direct responses from each configured financial provider. Crypto quantities without a USD valuation are listed separately by the service.</p></section>}

      {page === 'balances' && balances && cryptoHoldings.length > 0 && <section className="enterprise-card enterprise-stack-card"><div className="enterprise-card-title"><div><span>Crypto holdings</span><small>Asset quantities reported without a USD valuation</small></div><Coins size={18} /></div><div className="enterprise-table-wrap"><table><thead><tr><th>Asset</th><th>Source</th><th className="numeric">Quantity</th></tr></thead><tbody>{cryptoHoldings.map((holding, index) => <tr key={`${holding.product}-${holding.asset}-${index}`}><td><strong>{holding.asset}</strong></td><td>{productNames[holding.product] ?? holding.product}</td><td className="numeric">{quantity.format(Number(holding.amount) || 0)}</td></tr>)}</tbody></table></div><p className="enterprise-description">The service reports these quantities as-is; valuing them would require a market data source.</p></section>}

      {page === 'transactions' && transactions && <>
        {transactions.length > 0 && <section className="enterprise-insights">
          <article className="enterprise-card"><div className="enterprise-card-title"><div><span>Monthly cash flow</span><small>Money in vs money out from reported activity</small></div><Activity size={18} /></div>
            {cashFlow.length ? <ResponsiveContainer width="100%" height={220}><BarChart data={cashFlow} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} barGap={2}><CartesianGrid stroke="var(--divider)" vertical={false} /><XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tickFormatter={value => compactMoney.format(Number(value))} tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} axisLine={false} tickLine={false} width={70} /><Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--divider)', borderRadius: 8 }} labelStyle={{ color: 'var(--text-secondary)' }} labelFormatter={value => monthLabel(String(value))} formatter={(value, name) => [money.format(Number(value)), name]} /><Legend iconType="circle" iconSize={8} formatter={value => <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{value}</span>} /><Bar dataKey="inflow" name="Money in" fill="var(--enterprise-inflow)" radius={[4, 4, 0, 0]} maxBarSize={26} /><Bar dataKey="outflow" name="Money out" fill="var(--enterprise-outflow)" radius={[4, 4, 0, 0]} maxBarSize={26} /></BarChart></ResponsiveContainer> : <div className="enterprise-empty">No dated activity to chart.</div>}
          </article>
          <article className="enterprise-card"><div className="enterprise-card-title"><div><span>Top spending categories</span><small>Outflows grouped by reported category</small></div><CircleDollarSign size={18} /></div>
            {topCategories.length ? <div className="enterprise-allocation">{topCategories.map(([category, total]) => <div key={category}><div><span>{categoryLabel(category)}</span><strong>{money.format(total)}</strong></div><i><b style={{ width: `${Math.max(3, total / topCategories[0][1] * 100)}%` }} /></i></div>)}</div> : <div className="enterprise-empty">No categorized outflows yet.</div>}
          </article>
        </section>}
        <section className="enterprise-card"><div className="enterprise-card-title"><div><span>Institutional activity</span><small>Latest normalized transactions across enrolled accounts</small></div><Citation path="/api/reports/transactions" label="Transaction report" /></div>
          {transactionIssues.length > 0 && <div className="enterprise-inline-warning"><strong>Some institutions could not return activity</strong><span>{transactionIssues.join(' · ')}</span></div>}
          {transactions.length > 0 && <div className="enterprise-filters">
            <div className="enterprise-search"><Search size={14} /><input value={txQuery} onChange={event => setTxQuery(event.target.value)} placeholder="Search description, counterparty, category…" aria-label="Search transactions" /></div>
            <select value={txInstitution} onChange={event => setTxInstitution(event.target.value)} aria-label="Filter by institution"><option value="all">All institutions</option>{institutions.map(name => <option key={name} value={name}>{name}</option>)}</select>
            <span className="enterprise-filter-count">{visibleTransactions.length.toLocaleString()} of {transactions.length.toLocaleString()}</span>
          </div>}
          <div className="enterprise-table-wrap"><table><thead><tr><th>Date</th><th>Description</th><th>Institution</th><th>Category</th><th>Status</th><th className="numeric">Amount</th></tr></thead><tbody>{visibleTransactions.length ? visibleTransactions.map((transaction, index) => <tr key={transaction.id || index}><td>{transaction.date}</td><td><strong>{transaction.description || transaction.counterparty || 'Transaction'}</strong><small>{transaction.account}</small></td><td>{transaction.institution}</td><td>{transaction.category || '—'}</td><td><span className="status connected">{transaction.status || 'posted'}</span></td><td className="numeric">{money.format(Number(transaction.amount) || 0)}</td></tr>) : <tr><td colSpan={6} className="enterprise-empty">{transactions.length ? 'No transactions match your filters.' : transactionIssues.length ? 'No activity could be loaded from the available institutions.' : 'No transactions were reported by connected accounts.'}</td></tr>}</tbody></table></div>
        </section>
      </>}

      {page === 'connections' && connections && <section className="enterprise-card"><div className="enterprise-card-title"><div><span>Connection health</span><small>Live availability of enterprise data providers</small></div><ShieldCheck size={18} /></div><div className="enterprise-connections">{connections.map(connection => <article key={`${connection.product}-${connection.institution_name ?? ''}`}><span className={`connection-dot ${connection.status}`} /><div><strong>{connection.institution_name ?? connection.label}</strong><small title={connection.error ? String(connection.error) : undefined}>{connectionMessage(connection)}</small></div><span className={`status ${connection.status}`}>{connection.status.replace('_', ' ')}</span></article>)}</div><p className="enterprise-description"><ScrollText size={13} /> Status is checked live through Finocurve Service. A provider issue does not disable enterprise mode while the service itself remains reachable. <Citation path="/api/health/connections" label="Connection health" /></p></section>}
    </div>
  )
}
