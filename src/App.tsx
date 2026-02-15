import { Routes, Route, Navigate } from 'react-router-dom'
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
import LoanDetailScreen from './screens/detail/LoanDetailScreen'
import RiskAnalysisScreen from './screens/detail/RiskAnalysisScreen'
// Standalone screens
import NewsScreen from './screens/main/NewsScreen'
import NotificationsScreen from './screens/main/NotificationsScreen'
// Settings sub-screens
import AccountScreen from './screens/settings/AccountScreen'
import CurrencyPickerScreen from './screens/settings/CurrencyPickerScreen'
import HelpFaqScreen from './screens/settings/HelpFaqScreen'
import AboutScreen from './screens/settings/AboutScreen'

function NewsPage() {
  return (
    <div style={{ minHeight: '100vh', padding: 40 }}>
      <NewsScreen />
    </div>
  )
}

function NotificationsPage() {
  return (
    <div style={{ minHeight: '100vh', padding: 40 }}>
      <NotificationsScreen />
    </div>
  )
}

export default function App() {
  return (
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
      {/* Main shell */}
      <Route path="/main" element={<MainShell />} />
      {/* Detail screens */}
      <Route path="/asset/:assetId" element={<AssetDetailScreen />} />
      <Route path="/loan/:assetId" element={<LoanDetailScreen />} />
      <Route path="/risk-analysis" element={<RiskAnalysisScreen />} />
      {/* Standalone */}
      <Route path="/news" element={<NewsPage />} />
      <Route path="/notifications" element={<NotificationsPage />} />
      {/* Settings sub-screens */}
      <Route path="/settings/account" element={<AccountScreen />} />
      <Route path="/settings/currency" element={<CurrencyPickerScreen />} />
      <Route path="/settings/help" element={<HelpFaqScreen />} />
      <Route path="/settings/about" element={<AboutScreen />} />
      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
