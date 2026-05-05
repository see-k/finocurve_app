/**
 * Built-in MCP-style tools that operate on the app's main BrowserWindow.
 * Same session/cookies as the user (no separate Playwright profile).
 */

import type { MCPToolInfo } from './mcpServer'
import { getMainBrowserWindow } from './mainWindow'

export const BUILTIN_APP_BROWSER_SERVER_NAME = 'finocurve-app'

/** Downsample captures so default screenshots stay small in model context. */
const MAX_SCREENSHOT_MAX_DIMENSION = 1280

/** Cap visible-text snapshots so Bedrock/context stays manageable (plain text, not screenshots). */
const MAX_PAGE_TEXT_CHARS = 36_000

/**
 * Static catalog of app routes. Keep in sync with src/App.tsx and src/screens/main/MainShell.tsx.
 * Each entry is { path, description, requiresAuth?, params? }.
 */
const APP_ROUTE_CATALOG: Array<{
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
  { path: '/main?tab=reports', description: 'Main shell — Reports tab.', requiresAuth: true },
  { path: '/main?tab=tracker', description: 'Main shell — Tracker tab (net worth & goals).', requiresAuth: true },
  { path: '/main?tab=settings', description: 'Main shell — Settings tab (links to sub-screens).', requiresAuth: true },
  { path: '/main?tab=documents', description: 'Note: there is no documents tab; Reports holds documents UX.', requiresAuth: true },
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

function jsonResult(payload: Record<string, unknown>): string {
  return JSON.stringify(payload)
}

const APP_BROWSER_REMOTE_INDICATOR_CHANNEL = 'app-browser-remote-indicator' as const

export function notifyRemoteIndicator(phase: 'start' | 'end', toolName: string): void {
  const win = getMainBrowserWindow()
  if (!win || win.isDestroyed()) return
  const wc = win.webContents
  if (!wc || wc.isDestroyed()) return
  wc.send(APP_BROWSER_REMOTE_INDICATOR_CHANNEL, { phase, toolName })
}

/** Ensures the renderer can paint between start/end (otherwise React batches both updates). */
const MIN_REMOTE_INDICATOR_MS = 480

async function withRemoteIndicator(toolName: string, fn: () => Promise<string>): Promise<string> {
  notifyRemoteIndicator('start', toolName)
  const started = Date.now()
  try {
    return await fn()
  } finally {
    const elapsed = Date.now() - started
    if (elapsed < MIN_REMOTE_INDICATOR_MS) {
      await new Promise<void>((resolve) => setTimeout(resolve, MIN_REMOTE_INDICATOR_MS - elapsed))
    }
    notifyRemoteIndicator('end', toolName)
  }
}

function normalizeHashRoute(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) return '#/'
  if (trimmed.startsWith('#')) return trimmed.startsWith('#/') ? trimmed : `#/${trimmed.slice(1)}`
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return `#${withSlash}`
}

export function getBuiltinAppBrowserTools(): MCPToolInfo[] {
  return [
    {
      serverName: BUILTIN_APP_BROWSER_SERVER_NAME,
      name: 'app_browser_screenshot',
      description:
        'Capture a PNG screenshot of the FinoCurve app window (same view as the logged-in user). Returns base64-encoded PNG and dimensions. Large windows are downscaled so the longest side is at most 1280px before scaleFactor is applied.',
      inputSchema: {
        type: 'object',
        properties: {
          scaleFactor: {
            type: 'number',
            description:
              'Optional scale factor applied after resize (default 1). Values > 1 produce a larger image.',
          },
        },
      },
    },
    {
      serverName: BUILTIN_APP_BROWSER_SERVER_NAME,
      name: 'app_browser_list_routes',
      description:
        'List every navigable route in the FinoCurve app (paths, descriptions, params, auth requirements). ALWAYS call this BEFORE app_browser_navigate when the user asks to go somewhere — never guess paths. Returns currentPath so you also know where the user is now.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      serverName: BUILTIN_APP_BROWSER_SERVER_NAME,
      name: 'app_browser_navigate',
      description:
        'Navigate the in-app SPA using the hash router. Pass an exact path from app_browser_list_routes (e.g. "/main?tab=portfolio", "/settings/ai-config", "/asset/123"). Returns the new currentPath after navigation so you can verify success.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description:
              'Exact route path after the hash, starting with / — must come from app_browser_list_routes.',
          },
        },
        required: ['path'],
      },
    },
    {
      serverName: BUILTIN_APP_BROWSER_SERVER_NAME,
      name: 'app_browser_click',
      description:
        'Click a button, link, tab, or other interactive element inside the FinoCurve app window by visible text or CSS selector. Use this for in-page UI like tabs (Overview/Volatility/History), toggle buttons, "Save", "Cancel", row actions, etc. — anything that is NOT a route navigation. Returns whether a match was clicked plus the element label.',
      inputSchema: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description:
              'Visible text of the element to click (case-insensitive, matches exact or contains). Example: "History", "Save changes", "Add asset". Either text OR selector is required.',
          },
          selector: {
            type: 'string',
            description:
              'CSS selector when text matching is ambiguous. Example: \'button[aria-label="Close"]\', \'[data-tab="history"]\'. Either text OR selector is required.',
          },
          role: {
            type: 'string',
            description:
              'Optional ARIA role hint to disambiguate (button, tab, link, menuitem, checkbox, switch).',
          },
          nth: {
            type: 'number',
            description:
              'When multiple elements match, pick the Nth (0-based). Default 0.',
          },
        },
      },
    },
    {
      serverName: BUILTIN_APP_BROWSER_SERVER_NAME,
      name: 'app_browser_scroll',
      description:
        'Scroll the main window document (window.scrollBy). Use deltaY positive to scroll down, negative up.',
      inputSchema: {
        type: 'object',
        properties: {
          deltaY: {
            type: 'number',
            description: 'Vertical pixels to scroll (positive = down). Defaults to 0 if omitted.',
          },
          deltaX: {
            type: 'number',
            description: 'Horizontal pixels to scroll (positive = right). Defaults to 0 if omitted.',
          },
        },
      },
    },
    {
      serverName: BUILTIN_APP_BROWSER_SERVER_NAME,
      name: 'app_browser_page_text',
      description:
        'Extract accessible visible text from the FinoCurve app window (same session as the user): body innerText plus optional headings and list excerpts. Prefer this over app_browser_screenshot when you need labels, headings, buttons, or form fields—screenshots omit base64 in model context.',
      inputSchema: {
        type: 'object',
        properties: {
          includeOutline: {
            type: 'boolean',
            description:
              'If true (default), prepend headings and short list excerpts before full innerText.',
          },
        },
      },
    },
  ]
}

export async function callBuiltinAppBrowserTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<string | null> {
  switch (toolName) {
    case 'app_browser_screenshot':
      return withRemoteIndicator(toolName, () => screenshotTool(args))
    case 'app_browser_list_routes':
      return withRemoteIndicator(toolName, () => listRoutesTool())
    case 'app_browser_navigate':
      return withRemoteIndicator(toolName, () => navigateTool(args))
    case 'app_browser_click':
      return withRemoteIndicator(toolName, () => clickTool(args))
    case 'app_browser_scroll':
      return withRemoteIndicator(toolName, () => scrollTool(args))
    case 'app_browser_page_text':
      return withRemoteIndicator(toolName, () => pageTextTool(args))
    default:
      return null
  }
}

async function readCurrentPath(): Promise<string | null> {
  const win = getMainBrowserWindow()
  if (!win || win.isDestroyed()) return null
  try {
    const path = await win.webContents.executeJavaScript(
      `(function () { return (window.location.hash || '').replace(/^#/, '') || '/'; })()`,
      true
    )
    return typeof path === 'string' ? path : null
  } catch {
    return null
  }
}

async function listRoutesTool(): Promise<string> {
  const currentPath = await readCurrentPath()
  return jsonResult({
    ok: true,
    currentPath,
    note:
      'Use the exact "path" string from this list when calling app_browser_navigate. Paths with :param segments require a real id. /main is the authenticated shell — its sub-views are query-string tabs, not nested routes.',
    routes: APP_ROUTE_CATALOG,
  })
}

async function screenshotTool(args: Record<string, unknown>): Promise<string> {
  const win = getMainBrowserWindow()
  if (!win || win.isDestroyed()) {
    return jsonResult({ ok: false, error: 'Main application window is not available.' })
  }

  const scale =
    typeof args.scaleFactor === 'number' && Number.isFinite(args.scaleFactor) && args.scaleFactor > 0
      ? args.scaleFactor
      : 1

  try {
    const image = await win.webContents.capturePage()
    let working = image
    let { width: w, height: h } = working.getSize()
    if (w > MAX_SCREENSHOT_MAX_DIMENSION || h > MAX_SCREENSHOT_MAX_DIMENSION) {
      const fit = Math.min(MAX_SCREENSHOT_MAX_DIMENSION / w, MAX_SCREENSHOT_MAX_DIMENSION / h)
      w = Math.max(1, Math.round(w * fit))
      h = Math.max(1, Math.round(h * fit))
      working = working.resize({ width: w, height: h })
    }
    const { width: rw, height: rh } = working.getSize()
    const resized =
      scale !== 1
        ? working.resize({
            width: Math.round(rw * scale),
            height: Math.round(rh * scale),
          })
        : working
    const pngBuffer = resized.toPNG()
    const { width, height } = resized.getSize()
    return jsonResult({
      ok: true,
      mimeType: 'image/png',
      base64: pngBuffer.toString('base64'),
      width,
      height,
    })
  } catch (err) {
    return jsonResult({
      ok: false,
      error: err instanceof Error ? err.message : 'capturePage failed',
    })
  }
}

async function navigateTool(args: Record<string, unknown>): Promise<string> {
  const win = getMainBrowserWindow()
  if (!win || win.isDestroyed()) {
    return jsonResult({ ok: false, error: 'Main application window is not available.' })
  }

  const path = args.path
  if (typeof path !== 'string' || !path.trim()) {
    return jsonResult({ ok: false, error: 'Missing or invalid "path" (expected non-empty string).' })
  }

  const requested = path.trim()
  const hash = normalizeHashRoute(requested)
  const targetPath = hash.replace(/^#/, '')

  try {
    await win.webContents.executeJavaScript(
      `
      (function () {
        var target = ${JSON.stringify(hash)};
        if (window.location.hash === target) {
          window.dispatchEvent(new HashChangeEvent('hashchange', {
            oldURL: window.location.href,
            newURL: window.location.href,
          }));
        } else {
          window.location.hash = target;
        }
        return window.location.href;
      })()
      `,
      true
    )

    await new Promise<void>((resolve) => setTimeout(resolve, 220))

    const currentPath = await readCurrentPath()
    const ok = !!currentPath && currentPath === targetPath
    return jsonResult({
      ok,
      requestedPath: targetPath,
      currentPath,
      note: ok
        ? undefined
        : 'Hash applied but route did not resolve to the requested path. The path may be unknown — call app_browser_list_routes to verify available routes.',
    })
  } catch (err) {
    return jsonResult({
      ok: false,
      error: err instanceof Error ? err.message : 'Navigation failed',
    })
  }
}

async function pageTextTool(args: Record<string, unknown>): Promise<string> {
  const win = getMainBrowserWindow()
  if (!win || win.isDestroyed()) {
    return jsonResult({ ok: false, error: 'Main application window is not available.' })
  }

  const includeOutline = args.includeOutline !== false && args.includeOutline !== 'false'

  try {
    const extracted = await win.webContents.executeJavaScript(
      `
      (function () {
        function norm(s) {
          return (s || '').replace(/\\s+/g, ' ').trim()
        }

        function dedupe(seq, cap) {
          var seen = Object.create(null)
          var out = []
          for (var i = 0; i < seq.length && out.length < cap; i++) {
            var item = seq[i]
            if (item.length && !seen[item]) {
              seen[item] = true
              out.push(item)
            }
          }
          return out
        }

        var headingEls = document.querySelectorAll('h1, h2, h3, h4, [role="heading"]')
        var headings = []
        for (var hi = 0; hi < headingEls.length; hi++) {
          var ht = norm(headingEls[hi].innerText || headingEls[hi].textContent || '')
          if (ht.length) headings.push(ht)
        }
        headings = dedupe(headings, 120)

        var snippetLines = []
        var uls = document.querySelectorAll('ul, ol')
        var maxLists = 25
        for (var ui = 0; ui < uls.length && snippetLines.length < maxLists; ui++) {
          var ul = uls[ui]
          var items = []
          var lis = ul.querySelectorAll(':scope > li')
          for (var li = 0; li < Math.min(lis.length, 14); li++) {
            var it = norm(lis[li].innerText || lis[li].textContent || '')
            if (it.length) items.push('- ' + it)
          }
          if (items.length) {
            snippetLines.push(items.slice(0, 12).join('\\n'))
          }
        }

        var body = document.body
        var inner = body ? String(body.innerText || '').replace(/\\n{3,}/g, '\\n\\n').trim() : ''
        var currentPath = (window.location.hash || '').replace(/^#/, '') || '/'

        return { headings: headings, listSnippets: snippetLines, innerText: inner, currentPath: currentPath }
      })()
      `,
      true
    )

    type Extracted = {
      headings?: string[]
      listSnippets?: string[]
      innerText?: string
      currentPath?: string
    }
    const e = extracted as Extracted
    const headings = Array.isArray(e.headings) ? e.headings.filter((x) => typeof x === 'string') : []
    const listSnippets = Array.isArray(e.listSnippets) ? e.listSnippets.filter((x) => typeof x === 'string') : []
    const innerText = typeof e.innerText === 'string' ? e.innerText : ''
    const currentPath = typeof e.currentPath === 'string' ? e.currentPath : undefined

    const sections: string[] = []
    if (includeOutline) {
      if (headings.length) {
        sections.push(`--- Headings ---\n${headings.join('\n')}`)
      }
      if (listSnippets.length) {
        sections.push(`--- List excerpts ---\n${listSnippets.slice(0, 24).join('\n---\n')}`)
      }
    }
    if (innerText.length) sections.push(innerText)

    const fullText = sections.length ? sections.join('\n\n') : ''
    const charCountBeforeCap = fullText.length
    const truncated = charCountBeforeCap > MAX_PAGE_TEXT_CHARS
    const text = truncated ? fullText.slice(0, MAX_PAGE_TEXT_CHARS) : fullText

    const payload: Record<string, unknown> = {
      ok: true,
      currentPath,
      text,
      chars: charCountBeforeCap,
      truncated,
    }
    if (truncated) {
      payload.note = `Truncated at ${MAX_PAGE_TEXT_CHARS} characters; navigate or scroll and call again for more.`
    }
    return jsonResult(payload)
  } catch (err) {
    return jsonResult({
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to extract page text',
    })
  }
}

async function clickTool(args: Record<string, unknown>): Promise<string> {
  const win = getMainBrowserWindow()
  if (!win || win.isDestroyed()) {
    return jsonResult({ ok: false, error: 'Main application window is not available.' })
  }

  const text = typeof args.text === 'string' ? args.text.trim() : ''
  const selector = typeof args.selector === 'string' ? args.selector.trim() : ''
  const role = typeof args.role === 'string' ? args.role.trim() : ''
  const nth = typeof args.nth === 'number' && Number.isFinite(args.nth) ? Math.max(0, Math.floor(args.nth)) : 0

  if (!text && !selector) {
    return jsonResult({ ok: false, error: 'Provide either "text" or "selector".' })
  }

  try {
    const result = await win.webContents.executeJavaScript(
      `
      (function () {
        var TEXT = ${JSON.stringify(text)};
        var SELECTOR = ${JSON.stringify(selector)};
        var ROLE = ${JSON.stringify(role)};
        var NTH = ${JSON.stringify(nth)};

        function isVisible(el) {
          if (!el || !(el instanceof Element)) return false;
          var rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return false;
          var cs = window.getComputedStyle(el);
          if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) return false;
          return true;
        }

        function describe(el) {
          var tag = el.tagName.toLowerCase();
          var aria = el.getAttribute('aria-label') || '';
          var label = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 80);
          return { tag: tag, ariaLabel: aria, text: label };
        }

        function elementText(el) {
          return (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
        }

        var pool = [];

        if (SELECTOR) {
          try {
            var nodes = document.querySelectorAll(SELECTOR);
            for (var i = 0; i < nodes.length; i++) if (isVisible(nodes[i])) pool.push(nodes[i]);
          } catch (e) {
            return { ok: false, error: 'Invalid selector: ' + (e && e.message ? e.message : String(e)) };
          }
        }

        if (!pool.length && TEXT) {
          var needle = TEXT.toLowerCase();
          var roleSel = ROLE
            ? '[role="' + ROLE + '"]'
            : 'button, a, [role="tab"], [role="button"], [role="link"], [role="menuitem"], [role="option"], [role="switch"], [role="checkbox"], summary, label';
          var candidates = document.querySelectorAll(roleSel);
          var exact = [], contains = [];
          for (var j = 0; j < candidates.length; j++) {
            var el = candidates[j];
            if (!isVisible(el)) continue;
            var t = elementText(el).toLowerCase();
            var aria = (el.getAttribute('aria-label') || '').toLowerCase();
            var matchExact = t === needle || aria === needle;
            var matchContains = t.indexOf(needle) !== -1 || aria.indexOf(needle) !== -1;
            if (matchExact) exact.push(el);
            else if (matchContains) contains.push(el);
          }
          pool = exact.length ? exact : contains;
        }

        if (!pool.length) {
          return { ok: false, error: 'No matching element found.', matchCount: 0 };
        }

        var idx = Math.min(NTH, pool.length - 1);
        var target = pool[idx];

        try { target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' }); } catch (_) {}
        try { target.focus({ preventScroll: true }); } catch (_) {}

        if (typeof target.click === 'function') {
          target.click();
        } else {
          var ev = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
          target.dispatchEvent(ev);
        }

        return { ok: true, matchCount: pool.length, selectedIndex: idx, element: describe(target) };
      })()
      `,
      true
    )

    const obj = (result && typeof result === 'object') ? (result as Record<string, unknown>) : { ok: false, error: 'Click returned no result' }

    if (obj.ok) {
      await new Promise<void>((resolve) => setTimeout(resolve, 220))
      const currentPath = await readCurrentPath()
      ;(obj as Record<string, unknown>).currentPath = currentPath
    }

    return jsonResult(obj)
  } catch (err) {
    return jsonResult({
      ok: false,
      error: err instanceof Error ? err.message : 'Click failed',
    })
  }
}

async function scrollTool(args: Record<string, unknown>): Promise<string> {
  const win = getMainBrowserWindow()
  if (!win || win.isDestroyed()) {
    return jsonResult({ ok: false, error: 'Main application window is not available.' })
  }

  const deltaY = typeof args.deltaY === 'number' && Number.isFinite(args.deltaY) ? args.deltaY : 0
  const deltaX = typeof args.deltaX === 'number' && Number.isFinite(args.deltaX) ? args.deltaX : 0

  if (deltaY === 0 && deltaX === 0) {
    return jsonResult({
      ok: false,
      error: 'Provide deltaY and/or deltaX (non-zero) to scroll.',
    })
  }

  try {
    const pos = await win.webContents.executeJavaScript(
      `
      (function () {
        window.scrollBy({ left: ${deltaX}, top: ${deltaY}, behavior: 'auto' });
        return {
          scrollX: window.scrollX,
          scrollY: window.scrollY,
          innerHeight: window.innerHeight,
          documentScrollHeight: document.documentElement.scrollHeight,
        };
      })()
      `,
      true
    )
    return jsonResult({ ok: true, deltaX, deltaY, ...pos })
  } catch (err) {
    return jsonResult({
      ok: false,
      error: err instanceof Error ? err.message : 'Scroll failed',
    })
  }
}
