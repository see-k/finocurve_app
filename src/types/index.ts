// ============================================
// Enums
// ============================================

export type AssetType =
  | 'stock'
  | 'etf'
  | 'bond'
  | 'crypto'
  | 'real_estate'
  | 'private_equity'
  | 'commodity'
  | 'cash'
  | 'other'

export type AssetCategory = 'public' | 'manual' | 'loan'

export type LoanType =
  | 'mortgage'
  | 'auto_loan'
  | 'student_loan'
  | 'personal_loan'
  | 'business_loan'
  | 'credit_card'
  | 'home_equity'
  | 'other'

export type AssetSector =
  | 'technology'
  | 'healthcare'
  | 'financials'
  | 'consumer_discretionary'
  | 'consumer_staples'
  | 'industrials'
  | 'energy'
  | 'utilities'
  | 'materials'
  | 'real_estate'
  | 'communication'
  | 'crypto'
  | 'diversified'
  | 'other'

export type InvestmentGoal = 'growth' | 'income' | 'preservation' | 'speculation'
export type DataEntryMethod = 'manual' | 'csv' | 'demo'
export type { AppThemeId } from '../theme/themes'
/** Alias for preferences / legacy references */
export type ThemeMode = import('../theme/themes').AppThemeId

// ============================================
// Asset
// ============================================

export interface Asset {
  id: string
  name: string
  symbol?: string
  type: AssetType
  category: AssetCategory
  quantity: number
  costBasis: number
  currentPrice: number
  currency: string
  purchaseDate?: string
  targetSellDate?: string
  brokerage?: string
  notes?: string
  tags: string[]
  sector?: AssetSector
  country?: string
  // Loan fields
  loanType?: LoanType
  interestRate?: number
  loanTermMonths?: number
  monthlyPayment?: number
  loanStartDate?: string
  extraMonthlyPayment?: number
}

// Computed helpers
export function isLoan(asset: Asset): boolean {
  return asset.category === 'loan'
}

export function assetCurrentValue(asset: Asset): number {
  return asset.quantity * asset.currentPrice
}

export function assetGainLoss(asset: Asset): number {
  return assetCurrentValue(asset) - asset.costBasis
}

export function assetGainLossPercent(asset: Asset): number {
  return asset.costBasis > 0 ? (assetGainLoss(asset) / asset.costBasis) * 100 : 0
}

export function loanPrincipal(asset: Asset): number {
  return isLoan(asset) ? Math.abs(asset.costBasis) : 0
}

export function loanBalance(asset: Asset): number {
  return isLoan(asset) ? Math.abs(asset.currentPrice) : 0
}

export function loanPaidOff(asset: Asset): number {
  return loanPrincipal(asset) - loanBalance(asset)
}

export function loanPayoffPercent(asset: Asset): number {
  const principal = loanPrincipal(asset)
  return principal > 0 ? (loanPaidOff(asset) / principal) * 100 : 0
}

// ============================================
// Portfolio
// ============================================

export interface Portfolio {
  id: string
  name: string
  currency: string
  assets: Asset[]
  createdAt: string
  updatedAt: string
}

export function portfolioTotalValue(p: Portfolio): number {
  return p.assets.reduce((sum, a) => sum + assetCurrentValue(a), 0)
}

export function portfolioTotalCost(p: Portfolio): number {
  return p.assets.reduce((sum, a) => sum + a.costBasis, 0)
}

export function portfolioTotalGainLoss(p: Portfolio): number {
  return portfolioTotalValue(p) - portfolioTotalCost(p)
}

export function portfolioTotalGainLossPercent(p: Portfolio): number {
  const cost = portfolioTotalCost(p)
  return cost > 0 ? (portfolioTotalGainLoss(p) / cost) * 100 : 0
}

export function portfolioAllocationByType(p: Portfolio): Record<string, number> {
  const alloc: Record<string, number> = {}
  for (const asset of p.assets) {
    const val = assetCurrentValue(asset)
    alloc[asset.type] = (alloc[asset.type] || 0) + val
  }
  return alloc
}

export function portfolioAllocationBySector(p: Portfolio): Record<string, number> {
  const alloc: Record<string, number> = {}
  for (const asset of p.assets) {
    const key = asset.sector || 'other'
    const val = assetCurrentValue(asset)
    alloc[key] = (alloc[key] || 0) + val
  }
  return alloc
}

export function portfolioAllocationByCountry(p: Portfolio, excludeLoans = false): Record<string, number> {
  const alloc: Record<string, number> = {}
  const assets = excludeLoans ? p.assets.filter((a) => !isLoan(a)) : p.assets
  for (const asset of assets) {
    const key = asset.country || 'Unknown'
    const val = assetCurrentValue(asset)
    alloc[key] = (alloc[key] || 0) + val
  }
  return alloc
}

// ============================================
// User Preferences
// ============================================

export interface UserPreferences {
  hasCompletedOnboarding: boolean
  isGuest: boolean
  selectedAssetTypes: AssetType[]
  preferredDataEntry: DataEntryMethod
  primaryGoal?: InvestmentGoal
  defaultCurrency: string
  userName?: string
  userEmail?: string
  profilePicturePath?: string
  hasAgreedToTerms: boolean
  theme: ThemeMode
  notificationsEnabled: boolean
  priceAlerts: boolean
  portfolioUpdates: boolean
  marketNews: boolean
  // S3 cloud storage (user-owned bucket; secret stored in Electron main only)
  s3Bucket?: string
  s3Region?: string
  s3AccessKeyId?: string
  /** Auto-upload Tracker SQLite snapshot to S3 after changes (requires S3 configured) */
  trackerS3AutoBackup: boolean
  /** Pull newer Tracker DB from S3 when remote manifest is newer (requires S3 configured) */
  trackerS3AutoSync: boolean
  /** When true, Tracker goal cards start collapsed (per-goal expand state is remembered separately) */
  trackerGoalsCollapsedByDefault: boolean
}

// ============================================
// Tracker (logged net worth + goals)
// ============================================

export type NetWorthSource = 'manual' | 'ai'

export interface NetWorthEntry {
  id: string
  amount: number
  recordedAt: string
  source: NetWorthSource
  note: string | null
}

/** What metric this goal measures progress against */
export type TrackerGoalProgressSource =
  | 'net_worth'
  | 'portfolio_balance'
  | 'debt_loans'
  | 'risk_score'

export interface TrackerGoal {
  id: string
  title: string
  targetAmount: number
  baselineAmount: number
  createdAt: string
  targetDate: string | null
  progressSource: TrackerGoalProgressSource
}

// ============================================
// Watchlist
// ============================================

export interface WatchlistItem {
  symbol: string
  name: string
  type: string
  addedAt: string
}

// ============================================
// Notifications
// ============================================

export type NotificationType = 'welcome' | 'pro_welcome' | 'pro_failed' | 'info' | 'alert'

export interface AppNotification {
  id: string
  title: string
  message: string
  type: NotificationType
  createdAt: string
  isRead: boolean
}

// ============================================
// Chart data
// ============================================

export interface PerformancePoint {
  date: string
  value: number
  gainLoss?: number
  gainLossPercent?: number
}

export type PerformancePeriod = '1D' | '1W' | '1M' | '1Y'

// ============================================
// Risk Analysis
// ============================================

export type RiskLevel = 'conservative' | 'moderate' | 'growth' | 'aggressive'
export type VolatilityLevel = 'low' | 'moderate' | 'high' | 'very_high'
export type SharpeRating = 'poor' | 'below_average' | 'average' | 'good' | 'excellent'
export type LiquidityLevel = 'high' | 'moderate' | 'low' | 'illiquid'
export type LiquidityCategory = 'immediate' | 'short_term' | 'medium_term' | 'long_term'
export type ScenarioSeverity = 'mild' | 'moderate' | 'severe' | 'extreme'
export type SuggestionPriority = 'high' | 'medium' | 'low'

/** Explainability metadata for defensible, source-backed recommendations */
export type ConfidenceLevel = 'high' | 'medium' | 'low'

export interface ExplainableMetadata {
  /** Where the data/rule comes from */
  dataSource: string
  /** Assumptions made in the calculation */
  assumptions: string[]
  /** Confidence in the recommendation (high/medium/low) */
  confidence: ConfidenceLevel
  /** What changed since last report (if previous snapshot available) */
  changeSinceLastReport?: string
}

export interface ConcentrationWarning { type: 'high' | 'medium'; message: string; asset: string; percentage: number; explainable?: ExplainableMetadata }
export interface CorrelationPair { asset1: string; asset2: string; correlation: number }
export interface BenchmarkComparison {
  benchmarkName: string; benchmarkReturn: number; benchmarkVolatility: number; benchmarkSharpe: number
  portfolioReturn: number; portfolioVolatility: number; portfolioSharpe: number
  returnDiff: number; riskDiff: number; verdict: string
}
export interface AssetRiskContribution { assetName: string; symbol?: string; type: AssetType; portfolioWeight: number; riskContribution: number }
export interface RebalancingSuggestion {
  action: 'buy' | 'sell' | 'review'; assetType: string; currentPercent: number; targetPercent: number
  changeAmount: number; reason: string; priority: SuggestionPriority
  /** Source-backed reasoning for explainability */
  explainable: ExplainableMetadata
}

export interface ScenarioResult {
  name: string; description: string; impactPercent: number; impactAmount: number; severity: ScenarioSeverity
}

/** Explainable metric with source, assumptions, and confidence */
export interface ExplainableMetric {
  metricId: string
  label: string
  value: string | number
  explainable: ExplainableMetadata
}

export interface RiskAnalysisResult {
  riskScore: number; riskLevel: RiskLevel
  volatility: number; annualizedVolatility: number; volatilityLevel: VolatilityLevel
  sharpeRatio: number; sharpeRating: SharpeRating
  maxDrawdown: number; maxDrawdownPercent: number
  concentrationWarnings: ConcentrationWarning[]; concentrationIndex: number
  liquidityScore: number; liquidityLevel: LiquidityLevel; liquidityBreakdown: Record<LiquidityCategory, number>
  diversificationScore: number; highCorrelations: CorrelationPair[]
  scenarioAnalysis: ScenarioResult[]
  riskContributionByType: Record<string, number>
  benchmarkComparison: BenchmarkComparison
  topRiskContributors: AssetRiskContribution[]
  rebalancingSuggestions: RebalancingSuggestion[]
  /** Explainable metrics for key risk indicators */
  explainableMetrics?: ExplainableMetric[]
  /** Summary of what changed since last report */
  changeSummary?: string[]
}

/** Stored risk snapshot for outcome tracking and change comparison */
export interface RiskSnapshot {
  id: string
  timestamp: string
  portfolioValue: number
  assetCount: number
  riskScore: number
  riskLevel: RiskLevel
  sharpeRatio: number
  annualizedVolatility: number
  maxDrawdownPercent: number
  diversificationScore: number
  liquidityScore: number
  allocationByType: Record<string, number>
}

// ============================================
// Loan Analysis
// ============================================

export interface LoanAnalysis {
  monthlyPayment: number
  totalInterest: number
  totalPayment: number
  payoffDate: string
  amortizationSchedule: AmortizationEntry[]
  // With extra payment
  extraMonthlyPayment: number
  newPayoffDate?: string
  interestSaved?: number
  monthsSaved?: number
}

export interface AmortizationEntry {
  month: number
  payment: number
  principal: number
  interest: number
  balance: number
}

// ============================================
// Navigation
// ============================================

export type MainTab = 'dashboard' | 'portfolio' | 'markets' | 'risk' | 'insights' | 'reports' | 'tracker' | 'settings'

// ============================================
// Display helpers
// ============================================

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  stock: 'Stocks',
  etf: 'ETFs',
  bond: 'Bonds',
  crypto: 'Crypto',
  real_estate: 'Real Estate',
  private_equity: 'Private Equity',
  commodity: 'Commodities',
  cash: 'Cash',
  other: 'Other',
}

export const ASSET_TYPE_ICONS: Record<AssetType, string> = {
  stock: '📈', etf: '📊', bond: '📜', crypto: '₿',
  real_estate: '🏠', private_equity: '🏢', commodity: '🥇',
  cash: '💵', other: '📦',
}

export const SECTOR_LABELS: Record<AssetSector, string> = {
  technology: 'Technology', healthcare: 'Healthcare', financials: 'Financials',
  consumer_discretionary: 'Consumer Disc.', consumer_staples: 'Consumer Staples',
  industrials: 'Industrials', energy: 'Energy', utilities: 'Utilities',
  materials: 'Materials', real_estate: 'Real Estate', communication: 'Communication',
  crypto: 'Cryptocurrency', diversified: 'Diversified', other: 'Other',
}

export const LOAN_TYPE_LABELS: Record<LoanType, string> = {
  mortgage: 'Mortgage', auto_loan: 'Auto Loan', student_loan: 'Student Loan',
  personal_loan: 'Personal Loan', business_loan: 'Business Loan',
  credit_card: 'Credit Card', home_equity: 'Home Equity', other: 'Other',
}

export const LOAN_TYPE_ICONS: Record<LoanType, string> = {
  mortgage: '🏠', auto_loan: '🚗', student_loan: '🎓',
  personal_loan: '💳', business_loan: '🏢', credit_card: '💳',
  home_equity: '🏡', other: '📋',
}

export const CURRENCIES = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'Fr' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr' },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr' },
  { code: 'DKK', name: 'Danish Krone', symbol: 'kr' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
]

export const INVESTMENT_GOAL_INFO: Record<InvestmentGoal, { label: string; desc: string; icon: string }> = {
  growth: { label: 'Long-term Growth', desc: 'Build wealth over time through capital appreciation', icon: '📈' },
  income: { label: 'Generate Income', desc: 'Generate regular income through dividends and interest', icon: '💰' },
  preservation: { label: 'Preserve Wealth', desc: 'Protect existing wealth with lower-risk investments', icon: '🛡️' },
  speculation: { label: 'Active Trading', desc: 'Seek higher returns through active market participation', icon: '⚡' },
}

export const BROKERAGES = [
  'Robinhood', 'Fidelity', 'Charles Schwab', 'TD Ameritrade', 'E*TRADE',
  'Vanguard', 'Interactive Brokers', 'Webull', 'Coinbase', 'Binance',
  'Kraken', 'Merrill Edge', 'SoFi', 'Public', 'Tastytrade', 'Other',
]
