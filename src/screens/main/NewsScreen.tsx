import { useState } from 'react'
import GlassContainer from '../../components/glass/GlassContainer'
import { TimelineWidget, EventsWidget, ForexCrossRatesWidget } from '../../components/TradingViewWidgets'
import './NewsScreen.css'

const UNSPLASH_NEWS_BG = 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=1200&q=80'

const TABS = [
  { id: 'news', label: 'Market News' },
  { id: 'calendar', label: 'Economic Calendar' },
  { id: 'economic', label: 'Economic Data' },
] as const

type TabId = typeof TABS[number]['id']

export default function NewsScreen() {
  const [tab, setTab] = useState<TabId>('news')

  return (
    <div className="news-screen">
      {/* Background image */}
      <div className="news-bg">
        <img src={UNSPLASH_NEWS_BG} alt="" className="news-bg__img" />
        <div className="news-bg__overlay" />
      </div>

      <div className="news-header">
        <h1 className="news-title">News & Data</h1>
        <p className="news-subtitle">Stay updated with the latest market information</p>
      </div>

      <div className="news-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`news-tab-btn ${tab === t.id ? 'news-tab-btn--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <GlassContainer className="news-widget-container" padding="0" borderRadius={16}>
        {tab === 'news' && <TimelineWidget height={520} />}
        {tab === 'calendar' && <EventsWidget height={520} />}
        {tab === 'economic' && <ForexCrossRatesWidget height={520} />}
      </GlassContainer>
    </div>
  )
}
