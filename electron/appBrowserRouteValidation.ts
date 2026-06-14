/**
 * Pure route validation for in-app browser navigation tools.
 * Kept separate from BrowserWindow wiring so tests can run without Electron.
 */

/** Tabs that MainShell actually recognizes; anything else falls back to dashboard. */
export const KNOWN_MAIN_TABS = new Set<string>([
  'dashboard',
  'portfolio',
  'markets',
  'news',
  'risk',
  'insights',
  'reports',
  'tracker',
  'settings',
])

/**
 * Static catalog of app routes. Keep in sync with src/App.tsx and src/screens/main/MainShell.tsx.
 */
export const APP_ROUTE_CATALOG: Array<{
  path: string
  description: string
  requiresAuth?: boolean
  params?: string[]
  aliases?: string[]
}> = [
  { path: '/', description: 'Splash screen (auto-routes to login or main).' },
  { path: '/welcome', description: 'Welcome / marketing screen.' },
  { path: '/login', description: 'Sign-in screen.' },
  { path: '/signup', description: 'Account creation screen.' },

  { path: '/main', description: 'Main shell — Dashboard tab (default).', requiresAuth: true },
  { path: '/main?tab=dashboard', description: 'Main shell — Dashboard tab.', requiresAuth: true },
  { path: '/main?tab=portfolio', description: 'Main shell — Portfolio tab (holdings & loans).', requiresAuth: true },
  { path: '/main?tab=markets', description: 'Main shell — Markets tab (TradingView widgets).', requiresAuth: true },
  { path: '/main?tab=news', description: 'Main shell — News & Data tab.', requiresAuth: true },
  { path: '/main?tab=risk', description: 'Main shell — Risk Analysis tab (embedded).', requiresAuth: true },
  { path: '/main?tab=insights', description: 'Main shell — Insights tab.', requiresAuth: true },
  { path: '/main?tab=reports', description: 'Main shell — Reports tab (documents UX lives here).', requiresAuth: true },
  { path: '/main?tab=tracker', description: 'Main shell — Tracker tab (net worth & goals).', requiresAuth: true },
  { path: '/main?tab=settings', description: 'Main shell — Settings tab (links to sub-screens).', requiresAuth: true },
  {
    path: '/main/loan/:assetId',
    description: 'Loan detail screen embedded in main shell.',
    requiresAuth: true,
    params: ['assetId'],
  },

  { path: '/onboarding/setup', description: 'Onboarding wizard (setup).' },
  { path: '/onboarding/create-portfolio', description: 'Onboarding — create portfolio.' },
  { path: '/onboarding/add-first-asset', description: 'Onboarding — add first asset.' },

  { path: '/add-asset/search', description: 'Add public asset by search (stocks/crypto).', requiresAuth: true },
  { path: '/add-asset/manual', description: 'Add a manual asset entry.', requiresAuth: true },
  { path: '/add-asset/loan', description: 'Add a loan.', requiresAuth: true },

  { path: '/asset/:assetId', description: 'Asset detail screen.', requiresAuth: true, params: ['assetId'] },
  { path: '/risk-analysis', description: 'Standalone risk analysis screen.', requiresAuth: true },
  { path: '/notifications', description: 'Notifications list.', requiresAuth: true },

  { path: '/settings/account', description: 'Settings — account.', requiresAuth: true },
  { path: '/settings/currency', description: 'Settings — currency picker.', requiresAuth: true },
  { path: '/settings/cloud-storage', description: 'Settings — cloud (S3) storage.', requiresAuth: true },
  { path: '/settings/tracker-storage', description: 'Settings — tracker storage.', requiresAuth: true },
  { path: '/settings/ai-config', description: 'Settings — AI provider, MCP servers, A2A.', requiresAuth: true },
  { path: '/settings/plugins', description: 'Settings — plugins list.', requiresAuth: true },
  { path: '/settings/plugins/fmp', description: 'Settings — FMP plugin (API key).', requiresAuth: true },
  { path: '/settings/help', description: 'Settings — help & FAQ.', requiresAuth: true },
  { path: '/settings/about', description: 'Settings — about.', requiresAuth: true },
]

export const APP_ROUTE_TOPIC_ALIASES: Array<{ topic: string; resolvesTo: string; note: string }> = [
  {
    topic: 'documents',
    resolvesTo: '/main?tab=reports',
    note: 'There is no separate documents tab; documents/reports UX is on the Reports tab.',
  },
  {
    topic: 'home',
    resolvesTo: '/main',
    note: 'The authenticated home is the Dashboard tab of /main.',
  },
]

/** Returns true if `requested` matches a catalog entry literally or via :param substitution. */
export function pathMatchesCatalog(requested: string): boolean {
  if (APP_ROUTE_CATALOG.some((r) => r.path === requested)) return true
  const [reqBase, reqQuery] = requested.split('?', 2)
  const reqSegs = reqBase.split('/').filter(Boolean)
  for (const r of APP_ROUTE_CATALOG) {
    if (!r.params || r.params.length === 0) continue
    const [rBase, rQuery] = r.path.split('?', 2)
    if ((rQuery ?? '') !== (reqQuery ?? '')) continue
    const rSegs = rBase.split('/').filter(Boolean)
    if (rSegs.length !== reqSegs.length) continue
    let ok = true
    for (let i = 0; i < rSegs.length; i++) {
      if (rSegs[i].startsWith(':')) continue
      if (rSegs[i] !== reqSegs[i]) {
        ok = false
        break
      }
    }
    if (ok) return true
  }
  return false
}

/**
 * Validate the requested path before navigating so the tool doesn't return
 * ok:true for routes that the SPA silently rewrites (e.g. unknown ?tab values
 * that fall through to the dashboard).
 */
export function validateRequestedPath(requested: string):
  | { ok: true }
  | { ok: false; error: string; suggestion?: string } {
  const [base, query] = requested.split('?', 2)
  if (base === '/main') {
    if (!query) return { ok: true }
    const params = new URLSearchParams(query)
    const tab = params.get('tab')
    if (tab && !KNOWN_MAIN_TABS.has(tab)) {
      const alias = APP_ROUTE_TOPIC_ALIASES.find((a) => a.topic === tab.toLowerCase())
      return {
        ok: false,
        error: `Unknown /main tab "${tab}". Valid tabs: ${[...KNOWN_MAIN_TABS].join(', ')}.`,
        suggestion: alias?.resolvesTo,
      }
    }
    return { ok: true }
  }
  if (pathMatchesCatalog(requested)) return { ok: true }
  return {
    ok: false,
    error: `Path "${requested}" is not in the route catalog. Call app_browser_list_routes for valid paths.`,
  }
}

export function normalizeHashRoute(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) return '#/'
  if (trimmed.startsWith('#')) return trimmed.startsWith('#/') ? trimmed : `#/${trimmed.slice(1)}`
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return `#${withSlash}`
}
