import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronDown } from 'lucide-react'
import GlassContainer from '../../components/glass/GlassContainer'
import GlassIconButton from '../../components/glass/GlassIconButton'
import './SettingsSubScreen.css'

const FAQ_ITEMS = [
  { q: 'What is FinoCurve?', a: 'FinoCurve is a personal portfolio tracker that lets you monitor stocks, ETFs, crypto, real estate, and loans all in one place. It runs entirely on your device with no cloud dependency.' },
  { q: 'Is my data stored online?', a: 'No. All your data is stored locally on your device using browser storage. Nothing is sent to any server. Your portfolio data stays private and under your control.' },
  { q: 'How do I add assets to my portfolio?', a: 'Use the "Add Asset" button on the Portfolio screen or the sidebar. You can search for public assets (stocks, ETFs, crypto), add manual holdings, or track loans.' },
  { q: 'Can I track loans and debt?', a: 'Yes! FinoCurve supports tracking mortgages, auto loans, student loans, and other debt. You can view amortization schedules and run payoff simulations.' },
  { q: 'How is risk analysis calculated?', a: 'Risk analysis uses your portfolio composition to calculate diversification scores, concentration risk, and liquidity ratings. Stress test scenarios simulate how your portfolio might perform under different market conditions.' },
  { q: 'How do I export my data?', a: 'Go to Settings and tap "Export Data". You can export your portfolio as a CSV file or a text summary that you can save or share.' },
  { q: 'Can I use multiple currencies?', a: 'You can set a base currency for your portfolio from Settings > Currency. The app supports 18 major world currencies.' },
  { q: 'How do I switch between light and dark mode?', a: 'Go to Settings > Appearance and choose Light or Dark mode. Your preference is saved automatically.' },
  { q: 'What is the watchlist feature?', a: 'The watchlist lets you save and monitor market assets you\'re interested in without adding them to your portfolio. Star any asset from the Markets screen to add it.' },
  { q: 'How do I delete my account?', a: 'Go to Settings > Danger Zone > Delete Account. This will permanently remove all your data from the device.' },
]

export default function HelpFaqScreen() {
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  return (
    <div className="settings-sub">
      <div className="settings-sub-bg settings-sub-bg--1" />
      <div className="settings-sub-bg settings-sub-bg--2" />
      <div className={`settings-sub-content ${visible ? 'settings-sub-content--visible' : ''}`}>
        <div className="settings-sub-header">
          <GlassIconButton icon={<ArrowLeft size={20} />} onClick={() => navigate(-1)} size={44} />
          <h1 className="settings-sub-title">Help & FAQ</h1>
        </div>

        <GlassContainer padding="8px">
          <div className="faq-list">
            {FAQ_ITEMS.map((item, i) => (
              <div key={i} className="faq-item">
                <button className="faq-item__question" onClick={() => setOpenIndex(openIndex === i ? null : i)}>
                  {item.q}
                  <ChevronDown size={18} className={`faq-chevron ${openIndex === i ? 'faq-chevron--open' : ''}`} />
                </button>
                {openIndex === i && (
                  <div className="faq-item__answer">{item.a}</div>
                )}
              </div>
            ))}
          </div>
        </GlassContainer>
      </div>
    </div>
  )
}
