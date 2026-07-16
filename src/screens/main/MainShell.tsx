import { useState, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams, useMatch, useLocation, Routes, Route, Navigate } from 'react-router-dom'
import {
  LayoutDashboard, Briefcase, BarChart3, Newspaper, Shield, Landmark, FileText, Settings,
  Plus, Search, PenLine, Target, MessagesSquare,
} from 'lucide-react'
import finocurveLogo from '/images/finocurve-logo.png'
import DashboardScreen from './DashboardScreen'
import PortfolioScreen from './PortfolioScreen'
import MarketsScreen from './MarketsScreen'
import InsightsScreen from './InsightsScreen'
import ReportsScreen from './ReportsScreen'
import SettingsScreen from './SettingsScreen'
import TrackerScreen from './TrackerScreen'
import NewsScreen from './NewsScreen'
import ChatsScreen from './ChatsScreen'
import RiskAnalysisScreen from '../detail/RiskAnalysisScreen'
import LoanDetailScreen from '../detail/LoanDetailScreen'
import AccountScreen from '../settings/AccountScreen'
import CurrencyPickerScreen from '../settings/CurrencyPickerScreen'
import CloudStorageScreen from '../settings/CloudStorageScreen'
import TrackerStorageScreen from '../settings/TrackerStorageScreen'
import AIConfigScreen from '../settings/AIConfigScreen'
import HelpFaqScreen from '../settings/HelpFaqScreen'
import AboutScreen from '../settings/AboutScreen'
import PluginsListPage from '../settings/plugins/PluginsListPage'
import FmpPluginPage from '../settings/plugins/FmpPluginPage'
import AgentsListScreen from '../settings/agents/AgentsListScreen'
import CreateEditAgentScreen from '../settings/agents/CreateEditAgentScreen'
import { TickerTapeWidget } from '../../components/TradingViewWidgets'
import type { MainTab } from '../../types'
import './MainShell.css'

const TAB_IDS: MainTab[] = [
  'dashboard', 'portfolio', 'markets', 'news', 'risk', 'insights', 'reports', 'tracker', 'chats', 'settings',
]

const tabs: { id: MainTab; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
  { id: 'portfolio', label: 'Portfolio', icon: <Briefcase size={20} /> },
  { id: 'markets', label: 'Markets', icon: <BarChart3 size={20} /> },
  { id: 'news', label: 'News & Data', icon: <Newspaper size={20} /> },
  { id: 'risk', label: 'Risk analysis', icon: <Shield size={20} /> },
  { id: 'insights', label: 'Insights', icon: <Landmark size={20} /> },
  { id: 'reports', label: 'Reports', icon: <FileText size={20} /> },
  { id: 'tracker', label: 'Tracker', icon: <Target size={20} /> },
  { id: 'chats', label: 'Chats', icon: <MessagesSquare size={20} /> },
  { id: 'settings', label: 'Settings', icon: <Settings size={20} /> },
]

export default function MainShell() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = useMemo((): MainTab => {
    const raw = searchParams.get('tab')
    if (raw && TAB_IDS.includes(raw as MainTab)) return raw as MainTab
    return 'dashboard'
  }, [searchParams])

  const setActiveTab = useCallback(
    (tab: MainTab) => {
      if (tab === 'dashboard') setSearchParams({}, { replace: true })
      else setSearchParams({ tab }, { replace: true })
    },
    [setSearchParams],
  )

  const [showFabMenu, setShowFabMenu] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const loanDetailMatch = useMatch({ path: '/main/loan/:assetId', end: true })
  const showLoanDetail = !!loanDetailMatch
  const isSettingsArea = location.pathname.startsWith('/settings')

  const goToShellTab = useCallback(
    (tab: MainTab) => {
      if (showLoanDetail || isSettingsArea) {
        if (tab === 'dashboard') navigate('/main', { replace: true })
        else navigate(`/main?tab=${tab}`, { replace: true })
        return
      }
      setActiveTab(tab)
    },
    [navigate, setActiveTab, showLoanDetail, isSettingsArea],
  )

  const navActiveTab: MainTab = showLoanDetail ? 'portfolio' : isSettingsArea ? 'settings' : activeTab

  const renderScreen = () => {
    switch (activeTab) {
      case 'dashboard': return <DashboardScreen />
      case 'portfolio': return <PortfolioScreen />
      case 'markets': return <MarketsScreen />
      case 'news': return <NewsScreen />
      case 'risk': return <RiskAnalysisScreen embeddedInShell />
      case 'insights': return <InsightsScreen />
      case 'reports': return <ReportsScreen />
      case 'tracker': return <TrackerScreen />
      case 'chats': return <ChatsScreen />
      case 'settings': return <SettingsScreen />
    }
  }

  const renderSettingsRoutes = () => (
    <Routes>
      <Route path="account" element={<AccountScreen />} />
      <Route path="currency" element={<CurrencyPickerScreen />} />
      <Route path="cloud-storage" element={<Navigate to="s3" replace />} />
      <Route path="cloud-storage/:section" element={<CloudStorageScreen />} />
      <Route path="tracker-storage" element={<TrackerStorageScreen />} />
      <Route path="ai-config" element={<Navigate to="provider" replace />} />
      <Route path="ai-config/:section" element={<AIConfigScreen />} />
      <Route path="plugins" element={<PluginsListPage />} />
      <Route path="plugins/fmp" element={<FmpPluginPage />} />
      <Route path="agents" element={<AgentsListScreen />} />
      <Route path="agents/new" element={<CreateEditAgentScreen />} />
      <Route path="agents/:agentId" element={<CreateEditAgentScreen />} />
      <Route path="help" element={<HelpFaqScreen />} />
      <Route path="about" element={<AboutScreen />} />
      <Route path="*" element={<Navigate to="/main?tab=settings" replace />} />
    </Routes>
  )

  const handleFabOption = (route: string) => {
    setShowFabMenu(false)
    navigate(route)
  }

  return (
    <div className="main-shell">
      {/* Pill-shaped floating navbar on left */}
      <nav className="nav-bar">
        {/* Logo */}
        <div className="nav-logo titlebar-drag">
          <img
            src={finocurveLogo}
            alt="FinoCurve"
            className="nav-logo__img titlebar-no-drag"
            draggable={false}
          />
        </div>

        {/* Pill container */}
        <div className="nav-pill">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              className={`nav-item ${navActiveTab === tab.id ? 'nav-item--active' : ''}`}
              onClick={() => goToShellTab(tab.id)}
              data-tooltip={tab.label}
              aria-current={navActiveTab === tab.id ? 'page' : undefined}
            >
              {tab.icon}
              {navActiveTab === tab.id && <span className="nav-item__indicator" />}
            </button>
          ))}
        </div>

        {/* FAB / Add Asset button */}
        <div className="nav-fab-area">
          <div className="fab-container">
            {showFabMenu && (
              <div className="fab-menu">
                <button type="button" className="fab-menu__item" onClick={() => handleFabOption('/add-asset/search')}>
                  <Search size={16} /> Search Public
                </button>
                <button type="button" className="fab-menu__item" onClick={() => handleFabOption('/add-asset/manual')}>
                  <PenLine size={16} /> Add Manual
                </button>
                <button type="button" className="fab-menu__item" onClick={() => handleFabOption('/add-asset/loan')}>
                  <Landmark size={16} /> Add Loan
                </button>
              </div>
            )}
            <button
              type="button"
              className={`nav-fab ${showFabMenu ? 'nav-fab--open' : ''}`}
              onClick={() => setShowFabMenu(!showFabMenu)}
              data-tooltip="Add Asset"
              aria-expanded={showFabMenu}
              aria-haspopup="true"
            >
              <Plus size={20} />
            </button>
          </div>
        </div>
      </nav>

      {/* Main content column — ticker sits above, spanning full width */}
      <div className="main-content-col">
        {!showLoanDetail && !isSettingsArea && activeTab === 'markets' && (
          <div className="shell-ticker">
            <TickerTapeWidget height={46} />
          </div>
        )}
        <main className="main-content">
          <div className="main-content__inner">
            {showLoanDetail ? (
              <LoanDetailScreen
                embeddedInShell
                assetId={loanDetailMatch?.params.assetId}
              />
            ) : isSettingsArea ? (
              renderSettingsRoutes()
            ) : (
              renderScreen()
            )}
          </div>
        </main>
      </div>

      {/* Click-away for FAB menu */}
      {showFabMenu && <div className="fab-overlay" onClick={() => setShowFabMenu(false)} />}
    </div>
  )
}
