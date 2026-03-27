import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutDashboard, Briefcase, BarChart3, Shield, Landmark, FileText, Settings, Plus, Search, PenLine } from 'lucide-react'
import finocurveLogo from '/images/finocurve-logo.png'
import DashboardScreen from './DashboardScreen'
import PortfolioScreen from './PortfolioScreen'
import MarketsScreen from './MarketsScreen'
import InsightsScreen from './InsightsScreen'
import ReportsScreen from './ReportsScreen'
import SettingsScreen from './SettingsScreen'
import RiskAnalysisScreen from '../detail/RiskAnalysisScreen'
import { TickerTapeWidget } from '../../components/TradingViewWidgets'
import type { MainTab } from '../../types'
import './MainShell.css'

const tabs: { id: MainTab; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
  { id: 'portfolio', label: 'Portfolio', icon: <Briefcase size={20} /> },
  { id: 'markets', label: 'Markets', icon: <BarChart3 size={20} /> },
  { id: 'risk', label: 'Risk analysis', icon: <Shield size={20} /> },
  { id: 'insights', label: 'Insights', icon: <Landmark size={20} /> },
  { id: 'reports', label: 'Reports', icon: <FileText size={20} /> },
  { id: 'settings', label: 'Settings', icon: <Settings size={20} /> },
]

export default function MainShell() {
  const [activeTab, setActiveTab] = useState<MainTab>('dashboard')
  const [showFabMenu, setShowFabMenu] = useState(false)
  const navigate = useNavigate()

  const renderScreen = () => {
    switch (activeTab) {
      case 'dashboard': return <DashboardScreen />
      case 'portfolio': return <PortfolioScreen />
      case 'markets': return <MarketsScreen />
      case 'risk': return <RiskAnalysisScreen embeddedInShell />
      case 'insights': return <InsightsScreen />
      case 'reports': return <ReportsScreen />
      case 'settings': return <SettingsScreen />
    }
  }

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
              className={`nav-item ${activeTab === tab.id ? 'nav-item--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              data-tooltip={tab.label}
              aria-current={activeTab === tab.id ? 'page' : undefined}
            >
              {tab.icon}
              {activeTab === tab.id && <span className="nav-item__indicator" />}
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
        {activeTab === 'markets' && (
          <div className="shell-ticker">
            <TickerTapeWidget height={46} />
          </div>
        )}
        <main className="main-content">
          <div className="main-content__inner">
            {renderScreen()}
          </div>
        </main>
      </div>

      {/* Click-away for FAB menu */}
      {showFabMenu && <div className="fab-overlay" onClick={() => setShowFabMenu(false)} />}
    </div>
  )
}
