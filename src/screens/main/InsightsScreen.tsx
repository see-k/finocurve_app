import { useState } from 'react'
import { Landmark, FileText } from 'lucide-react'
import CongressionalTradesView from '../../components/insights/CongressionalTradesView'
import SECFilingsView from '../../components/insights/SECFilingsView'
import './InsightsScreen.css'

type InsightsTab = 'congress' | 'sec'

export default function InsightsScreen() {
  const [tab, setTab] = useState<InsightsTab>('congress')

  return (
    <div className="insights">
      <div className="insights-header">
        <h1 className="insights-title">Insights</h1>
        <p className="insights-subtitle">Congressional disclosures and SEC filings</p>
      </div>

      <div className="insights-tabs">
        <button
          className={`insights-tab ${tab === 'congress' ? 'insights-tab--active' : ''}`}
          onClick={() => setTab('congress')}
        >
          <Landmark size={16} /> Congressional Trades
        </button>
        <button
          className={`insights-tab ${tab === 'sec' ? 'insights-tab--active' : ''}`}
          onClick={() => setTab('sec')}
        >
          <FileText size={16} /> SEC Filings
        </button>
      </div>

      <div className="insights-content">
        {tab === 'congress' && <CongressionalTradesView />}
        {tab === 'sec' && <SECFilingsView />}
      </div>
    </div>
  )
}
