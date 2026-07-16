import { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate, useSearchParams, useMatch, useLocation, Routes, Route, Navigate } from 'react-router-dom'
import {
  LayoutDashboard, Briefcase, BarChart3, Newspaper, Shield, Landmark, FileText, Settings,
  Search, PenLine, Target, MessagesSquare, UsersRound, Workflow, WalletCards, PackagePlus,
  EarthIcon,
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
import ThemeScreen from '../settings/ThemeScreen'
import PluginsListPage from '../settings/plugins/PluginsListPage'
import FmpPluginPage from '../settings/plugins/FmpPluginPage'
import AgentsListScreen from '../settings/agents/AgentsListScreen'
import CreateEditAgentScreen from '../settings/agents/CreateEditAgentScreen'
import { TickerTapeWidget } from '../../components/TradingViewWidgets'
import type { MainTab } from '../../types'
import './MainShell.css'

type NavItem = { id: MainTab; label: string; icon: React.ReactNode; description?: string }

const dashboardNavItem: NavItem = {
  id: 'dashboard',
  label: 'Dashboard',
  icon: <LayoutDashboard size={20} />,
}

const settingsNavItem: NavItem = {
  id: 'settings',
  label: 'Settings',
  icon: <Settings size={20} />,
}

const navGroups: Array<{
  id: string
  label: string
  description: string
  icon: React.ReactNode
  items: NavItem[]
}> = [
  {
    id: 'portfolio',
    label: 'Portfolio',
    description: 'Manage your financial position',
    icon: <WalletCards size={20} />,
    items: [
      { id: 'portfolio', label: 'Holdings & loans', description: 'Positions, allocation and liabilities', icon: <Briefcase size={20} /> },
      { id: 'tracker', label: 'Net worth tracker', description: 'Personal net worth and financial goals', icon: <Target size={20} /> },
    ],
  },
  {
    id: 'research',
    label: 'Research and analysis',
    description: 'Market intelligence and reporting',
    icon: <Search size={20} />,
    items: [
      { id: 'markets', label: 'Markets', description: 'Prices, charts and market activity', icon: <BarChart3 size={20} /> },
      { id: 'news', label: 'News & data', description: 'Financial news and disclosures', icon: <Newspaper size={20} /> },
      { id: 'risk', label: 'Risk analysis', description: 'Exposure, volatility and concentration', icon: <Shield size={20} /> },
      { id: 'insights', label: 'Insights', description: 'Research and portfolio analytics', icon: <Landmark size={20} /> },
      { id: 'reports', label: 'Reports', description: 'Documents and generated analysis', icon: <FileText size={20} /> },
    ],
  },
  {
    id: 'ai',
    label: 'Agents and conversations',
    description: 'Your experts and conversations',
    icon: <EarthIcon size={20} />,
    items: [
      { id: 'experts', label: 'Experts', description: 'Build and manage specialist profiles', icon: <UsersRound size={20} /> },
      { id: 'chats', label: 'Chats', description: 'Work with experts and assistants', icon: <MessagesSquare size={20} /> },
    ],
  },
]

const TAB_IDS: MainTab[] = [
  dashboardNavItem.id,
  ...navGroups.flatMap((group) => group.items.map((item) => item.id)),
  settingsNavItem.id,
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
  const isExpertsArea = location.pathname.startsWith('/settings/agents')

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

  const navActiveTab: MainTab = showLoanDetail
    ? 'portfolio'
    : isExpertsArea
      ? 'experts'
      : isSettingsArea
        ? 'settings'
        : activeTab
  const activeNavGroupId = navGroups.find((group) => (
    group.items.some((item) => item.id === navActiveTab)
  ))?.id ?? null
  const [openNavGroup, setOpenNavGroup] = useState<string | null>(null)

  useEffect(() => {
    if (!openNavGroup && !showFabMenu) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpenNavGroup(null)
      setShowFabMenu(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [openNavGroup, showFabMenu])

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
      case 'experts': return <AgentsListScreen />
      case 'chats': return <ChatsScreen />
      case 'settings': return <SettingsScreen />
    }
  }

  const renderSettingsRoutes = () => (
    <Routes>
      <Route path="account" element={<AccountScreen />} />
      <Route path="theme" element={<ThemeScreen />} />
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
      <nav className="nav-bar" aria-label="Main navigation">
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
          <button
            type="button"
            className={`nav-item nav-standalone-item ${navActiveTab === dashboardNavItem.id ? 'nav-item--active' : ''}`}
            onClick={() => {
              setOpenNavGroup(null)
              setShowFabMenu(false)
              goToShellTab(dashboardNavItem.id)
            }}
            data-tooltip={dashboardNavItem.label}
            aria-current={navActiveTab === dashboardNavItem.id ? 'page' : undefined}
          >
            {dashboardNavItem.icon}
            {navActiveTab === dashboardNavItem.id && <span className="nav-item__indicator" />}
          </button>

          <span className="nav-pill__separator" aria-hidden="true" />

          {navGroups.map((group) => (
            <div
              key={group.id}
              className="nav-group"
              role="group"
              aria-label={group.label}
            >
              <button
                type="button"
                className={`nav-item nav-group-toggle ${activeNavGroupId === group.id ? 'nav-group-toggle--contains-active' : ''}`}
                onClick={() => {
                  setOpenNavGroup((current) => current === group.id ? null : group.id)
                  setShowFabMenu(false)
                }}
                data-tooltip={group.label}
                aria-expanded={openNavGroup === group.id}
                aria-haspopup="menu"
                aria-controls={`nav-group-popover-${group.id}`}
              >
                {group.icon}
              </button>

              {openNavGroup === group.id && (
                <div
                  id={`nav-group-popover-${group.id}`}
                  className="nav-group-popover"
                  role="menu"
                  aria-label={group.label}
                >
                  <div className="nav-group-popover__header">
                    <span>{group.icon}</span>
                    <div>
                      <strong>{group.label}</strong>
                      <small>{group.description}</small>
                    </div>
                  </div>
                  <div className="nav-group-popover__list">
                  {group.items.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="menuitem"
                      className={`nav-group-popover__item ${navActiveTab === tab.id ? 'nav-group-popover__item--active' : ''}`}
                      onClick={() => {
                        setOpenNavGroup(null)
                        goToShellTab(tab.id)
                      }}
                      aria-current={navActiveTab === tab.id ? 'page' : undefined}
                    >
                      <span className="nav-group-popover__item-icon">{tab.icon}</span>
                      <span>
                        <strong>{tab.label}</strong>
                        <small>{tab.description}</small>
                      </span>
                      {navActiveTab === tab.id && <i aria-hidden="true" />}
                    </button>
                  ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          <span className="nav-pill__separator" aria-hidden="true" />

          <div className="nav-static-controls" role="group" aria-label="App controls">
            <button
              type="button"
              className={`nav-item nav-standalone-item ${navActiveTab === settingsNavItem.id ? 'nav-item--active' : ''}`}
              onClick={() => {
                setOpenNavGroup(null)
                setShowFabMenu(false)
                goToShellTab(settingsNavItem.id)
              }}
              data-tooltip={settingsNavItem.label}
              aria-current={navActiveTab === settingsNavItem.id ? 'page' : undefined}
            >
              {settingsNavItem.icon}
              {navActiveTab === settingsNavItem.id && <span className="nav-item__indicator" />}
            </button>

            <div className="fab-container">
              {showFabMenu && (
                <div className="nav-group-popover nav-add-popover" role="menu" aria-label="Add asset">
                  <div className="nav-group-popover__header">
                    <span><PackagePlus size={18} /></span>
                    <div>
                      <strong>Add asset</strong>
                      <small>Add to your financial position</small>
                    </div>
                  </div>
                  <div className="nav-group-popover__list">
                    <button
                      type="button"
                      role="menuitem"
                      className="nav-group-popover__item"
                      onClick={() => handleFabOption('/add-asset/search')}
                    >
                      <span className="nav-group-popover__item-icon"><Search size={17} /></span>
                      <span><strong>Search public assets</strong><small>Stocks, ETFs, funds and crypto</small></span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="nav-group-popover__item"
                      onClick={() => handleFabOption('/add-asset/manual')}
                    >
                      <span className="nav-group-popover__item-icon"><PenLine size={17} /></span>
                      <span><strong>Add manual asset</strong><small>Private or manually valued positions</small></span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="nav-group-popover__item"
                      onClick={() => handleFabOption('/add-asset/loan')}
                    >
                      <span className="nav-group-popover__item-icon"><Landmark size={17} /></span>
                      <span><strong>Add loan</strong><small>Mortgages and other liabilities</small></span>
                    </button>
                  </div>
                </div>
              )}
              <button
                type="button"
                className={`nav-item nav-add-action ${showFabMenu ? 'nav-add-action--open' : ''}`}
                onClick={() => {
                  setOpenNavGroup(null)
                  setShowFabMenu((current) => !current)
                }}
                data-tooltip="Add Asset"
                aria-expanded={showFabMenu}
                aria-haspopup="true"
              >
                <PackagePlus size={20} />
              </button>
            </div>
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

      {/* Click-away for navigation popovers */}
      {(showFabMenu || openNavGroup) && (
        <div
          className="fab-overlay"
          onClick={() => {
            setShowFabMenu(false)
            setOpenNavGroup(null)
          }}
        />
      )}
    </div>
  )
}
