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
export type ThemeMode = 'light' | 'dark'

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

export function portfolioAllocationByCountry(p: Portfolio): Record<string, number> {
  const alloc: Record<string, number> = {}
  for (const asset of p.assets) {
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

export type RiskLevel = 'low' | 'moderate' | 'high' | 'very_high'

export interface RiskAnalysisResult {
  riskScore: number
  riskLevel: RiskLevel
  diversificationScore: number
  concentrationRisk: number
  liquidityScore: number
  annualizedVolatility: number
  sharpeRatio: number
  maxDrawdown: number
  beta: number
  sectorExposure: Record<string, number>
  geographicExposure: Record<string, number>
  typeExposure: Record<string, number>
  recommendations: string[]
}

export interface ScenarioResult {
  name: string
  description: string
  impact: number
  impactPercent: number
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

export type MainTab = 'dashboard' | 'portfolio' | 'markets' | 'settings'

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
