import { useEffect } from 'react'
import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import AIChatBubble from './components/ai/AIChatBubble'
import AIAppRemoteFrame from './components/appRemote/AIAppRemoteFrame'
import SplashScreen from './screens/SplashScreen'
import WelcomeScreen from './screens/WelcomeScreen'
import LoginScreen from './screens/LoginScreen'
import SignupScreen from './screens/SignupScreen'
import MainShell from './screens/main/MainShell'
// Onboarding
import SetupWizardScreen from './screens/onboarding/SetupWizardScreen'
import CreatePortfolioScreen from './screens/onboarding/CreatePortfolioScreen'
import AddFirstAssetScreen from './screens/onboarding/AddFirstAssetScreen'
// Add asset
import SearchPublicAssetScreen from './screens/add-asset/SearchPublicAssetScreen'
import AddManualAssetScreen from './screens/add-asset/AddManualAssetScreen'
import AddLoanScreen from './screens/add-asset/AddLoanScreen'
// Detail screens
import AssetDetailScreen from './screens/detail/AssetDetailScreen'
import RiskAnalysisScreen from './screens/detail/RiskAnalysisScreen'
// Standalone screens
import NotificationsScreen from './screens/main/NotificationsScreen'
import { usePreferences } from './store/usePreferences'
import { EnterpriseModeProvider } from './hooks/useEnterpriseMode'

function TrackerS3PrefsSync() {
  const { prefs } = usePreferences()
  useEffect(() => {
    const api = window.electronAPI
    if (!api?.trackerSetS3Options) return
    void api.trackerSetS3Options({
      autoBackup: prefs.trackerS3AutoBackup,
      autoSync: prefs.trackerS3AutoSync,
    })
    void api.trackerRunStartupSync?.()
  }, [prefs.trackerS3AutoBackup, prefs.trackerS3AutoSync])
  return null
}

function NotificationsPage() {
  return (
    <div style={{ minHeight: '100vh', padding: 40 }}>
      <NotificationsScreen />
    </div>
  )
}

function LegacyLoanRedirect() {
  const { assetId } = useParams()
  if (!assetId) return <Navigate to="/main?tab=portfolio" replace />
  return <Navigate to={`/main/loan/${assetId}`} replace />
}

export default function App() {
  return (
    <EnterpriseModeProvider>
    <TrackerS3PrefsSync />
    <Routes>
      <Route path="/" element={<SplashScreen />} />
      <Route path="/welcome" element={<WelcomeScreen />} />
      <Route path="/login" element={<LoginScreen />} />
      <Route path="/signup" element={<SignupScreen />} />
      {/* Onboarding */}
      <Route path="/onboarding/setup" element={<SetupWizardScreen />} />
      <Route path="/onboarding/create-portfolio" element={<CreatePortfolioScreen />} />
      <Route path="/onboarding/add-first-asset" element={<AddFirstAssetScreen />} />
      {/* Add asset */}
      <Route path="/add-asset/search" element={<SearchPublicAssetScreen />} />
      <Route path="/add-asset/manual" element={<AddManualAssetScreen />} />
      <Route path="/add-asset/loan" element={<AddLoanScreen />} />
      {/* Main shell (includes /main/loan/:assetId for loan detail, and /settings/* for
          settings sub-screens — both keep the global pill nav visible) */}
      <Route path="/main/*" element={<MainShell />} />
      <Route path="/settings/*" element={<MainShell />} />
      {/* Detail screens */}
      <Route path="/asset/:assetId" element={<AssetDetailScreen />} />
      <Route path="/loan/:assetId" element={<LegacyLoanRedirect />} />
      <Route path="/risk-analysis" element={<RiskAnalysisScreen />} />
      {/* News lives inside MainShell; keep /news for bookmarks */}
      <Route path="/news" element={<Navigate to="/main?tab=news" replace />} />
      <Route path="/notifications" element={<NotificationsPage />} />
      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    <AIAppRemoteFrame />
    <AIChatBubble />
    </EnterpriseModeProvider>
  )
}
