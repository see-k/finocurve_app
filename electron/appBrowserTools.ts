/**
 * Built-in MCP-style tools that operate on the app's main BrowserWindow.
 * Same session/cookies as the user (no separate Playwright profile).
 */

import type { MCPToolInfo } from './mcpServer'
import { getMainBrowserWindow } from './mainWindow'
import {
  APP_ROUTE_CATALOG,
  APP_ROUTE_TOPIC_ALIASES,
  normalizeHashRoute,
  validateRequestedPath,
} from './appBrowserRouteValidation'
import {
  assemblePageTextPayload,
  evaluateMainShellNavigation,
  parseScreenshotScaleFactor,
  parseScrollDeltas,
  shouldIncludePageOutline,
  validateClickArgs,
} from './appBrowserNavigationHelpers'

export const BUILTIN_APP_BROWSER_SERVER_NAME = 'finocurve-app'

/** Downsample captures so default screenshots stay small in model context. */
const MAX_SCREENSHOT_MAX_DIMENSION = 1280

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

/**
 * Indicator UX:
 *   - Don't surface the HUD for sub-perceptible work (≤ SHOW_AFTER_MS) — it
 *     just adds latency to fast tools like list_routes.
 *   - When the work is slow enough to show, keep the HUD on for at least
 *     MIN_VISIBLE_MS so a single frame doesn't flash by unreadably.
 */
const SHOW_INDICATOR_AFTER_MS = 120
const MIN_INDICATOR_VISIBLE_MS = 220

async function withRemoteIndicator(toolName: string, fn: () => Promise<string>): Promise<string> {
  let shownAt = 0
  const showTimer = setTimeout(() => {
    shownAt = Date.now()
    notifyRemoteIndicator('start', toolName)
  }, SHOW_INDICATOR_AFTER_MS)
  try {
    return await fn()
  } finally {
    clearTimeout(showTimer)
    if (shownAt > 0) {
      const visibleFor = Date.now() - shownAt
      if (visibleFor < MIN_INDICATOR_VISIBLE_MS) {
        await new Promise<void>((resolve) =>
          setTimeout(resolve, MIN_INDICATOR_VISIBLE_MS - visibleFor)
        )
      }
      notifyRemoteIndicator('end', toolName)
    }
  }
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
      'Use the exact "path" string from this list when calling app_browser_navigate. Paths with :param segments require a real id. /main is the authenticated shell — its sub-views are query-string tabs, not nested routes. Unknown /main tabs are rejected by app_browser_navigate (no silent fallback).',
    routes: APP_ROUTE_CATALOG,
    topicAliases: APP_ROUTE_TOPIC_ALIASES,
  })
}

/** CSS selector for the AI chat overlay so screenshots/text/clicks ignore it. */
const ASSISTANT_OVERLAY_SELECTOR = '.ai-chat-bubble'

/**
 * Hide the chat overlay (and any future assistant overlays) before sampling the
 * page, then restore. Returns the previous inline visibility so callers can revert.
 */
const HIDE_OVERLAY_JS = `
  (function () {
    var nodes = document.querySelectorAll(${JSON.stringify(ASSISTANT_OVERLAY_SELECTOR)});
    var prev = [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      prev.push(n.style.visibility || '');
      n.style.visibility = 'hidden';
    }
    window.__finocurveOverlayPrevVisibility = prev;
    return prev.length;
  })()
`

const RESTORE_OVERLAY_JS = `
  (function () {
    var nodes = document.querySelectorAll(${JSON.stringify(ASSISTANT_OVERLAY_SELECTOR)});
    var prev = window.__finocurveOverlayPrevVisibility || [];
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].style.visibility = prev[i] || '';
    }
    delete window.__finocurveOverlayPrevVisibility;
    return nodes.length;
  })()
`

async function screenshotTool(args: Record<string, unknown>): Promise<string> {
  const win = getMainBrowserWindow()
  if (!win || win.isDestroyed()) {
    return jsonResult({ ok: false, error: 'Main application window is not available.' })
  }

  const scale = parseScreenshotScaleFactor(args.scaleFactor)

  let overlayHidden = false
  try {
    try {
      await win.webContents.executeJavaScript(HIDE_OVERLAY_JS, true)
      overlayHidden = true
      // Let one frame paint so capturePage doesn't pick up the pre-hide pixels.
      await new Promise<void>((resolve) => setTimeout(resolve, 32))
    } catch {
      /* hiding is best-effort */
    }

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
  } finally {
    if (overlayHidden) {
      try {
        await win.webContents.executeJavaScript(RESTORE_OVERLAY_JS, true)
      } catch {
        /* restore is best-effort */
      }
    }
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

  const validation = validateRequestedPath(targetPath)
  if (!validation.ok) {
    return jsonResult({
      ok: false,
      requestedPath: targetPath,
      error: validation.error,
      ...(validation.suggestion ? { suggestion: validation.suggestion } : {}),
    })
  }

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

    const probe = await win.webContents
      .executeJavaScript(
        `(function () {
          var p = (window.location.hash || '').replace(/^#/, '') || '/'
          var nav = document.querySelector('[aria-current="page"]')
          var activeNav = nav ? (nav.getAttribute('data-tooltip') || nav.textContent || '').trim() : null
          return { currentPath: p, activeNavLabel: activeNav }
        })()`,
        true
      )
      .catch(() => null)

    const currentPath: string | null =
      probe && typeof probe === 'object' && typeof (probe as { currentPath?: unknown }).currentPath === 'string'
        ? (probe as { currentPath: string }).currentPath
        : await readCurrentPath()
    const activeNavLabel: string | null =
      probe && typeof probe === 'object' && typeof (probe as { activeNavLabel?: unknown }).activeNavLabel === 'string'
        ? (probe as { activeNavLabel: string }).activeNavLabel
        : null

    const { ok, note } = evaluateMainShellNavigation({ targetPath, currentPath, activeNavLabel })

    return jsonResult({
      ok,
      requestedPath: targetPath,
      currentPath,
      activeNavLabel,
      note,
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

  const includeOutline = shouldIncludePageOutline(args.includeOutline)

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

        // Hide the assistant chat overlay so its transcript and controls don't
        // contaminate the page snapshot. innerText respects display:none, so we
        // toggle it for the duration of this synchronous extraction and revert
        // before yielding back to the renderer.
        var overlayNodes = document.querySelectorAll(${JSON.stringify(ASSISTANT_OVERLAY_SELECTOR)})
        var prevDisplay = []
        for (var ox = 0; ox < overlayNodes.length; ox++) {
          prevDisplay.push(overlayNodes[ox].style.display || '')
          overlayNodes[ox].style.display = 'none'
        }

        function inOverlay(el) {
          for (var k = 0; k < overlayNodes.length; k++) {
            if (overlayNodes[k].contains(el)) return true
          }
          return false
        }

        try {
          var headingEls = document.querySelectorAll('h1, h2, h3, h4, [role="heading"]')
          var headings = []
          for (var hi = 0; hi < headingEls.length; hi++) {
            if (inOverlay(headingEls[hi])) continue
            var ht = norm(headingEls[hi].innerText || headingEls[hi].textContent || '')
            if (ht.length) headings.push(ht)
          }
          headings = dedupe(headings, 120)

          var snippetLines = []
          var uls = document.querySelectorAll('ul, ol')
          var maxLists = 25
          for (var ui = 0; ui < uls.length && snippetLines.length < maxLists; ui++) {
            var ul = uls[ui]
            if (inOverlay(ul)) continue
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
        } finally {
          for (var rx = 0; rx < overlayNodes.length; rx++) {
            overlayNodes[rx].style.display = prevDisplay[rx]
          }
        }
      })()
      `,
      true
    )

    return jsonResult(
      assemblePageTextPayload(extracted as Parameters<typeof assemblePageTextPayload>[0], {
        includeOutline,
      })
    )
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

  const clickArgs = validateClickArgs(args)
  if (!clickArgs.ok) {
    return jsonResult({ ok: false, error: clickArgs.error })
  }
  const { text, selector, role, nth } = clickArgs

  try {
    const result = await win.webContents.executeJavaScript(
      `
      (function () {
        var TEXT = ${JSON.stringify(text)};
        var SELECTOR = ${JSON.stringify(selector)};
        var ROLE = ${JSON.stringify(role)};
        var NTH = ${JSON.stringify(nth)};
        var OVERLAY_SEL = ${JSON.stringify(ASSISTANT_OVERLAY_SELECTOR)};

        // Native HTML elements that carry an implicit ARIA role; passing
        // role: "button" should also match <button>, role: "link" should also
        // match <a href>, etc. This avoids the [role="..."] attribute trap.
        var IMPLICIT_ROLE_SELECTORS = {
          button: 'button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"], summary',
          link: 'a[href], [role="link"]',
          tab: '[role="tab"]',
          menuitem: '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]',
          option: 'option, [role="option"]',
          checkbox: 'input[type="checkbox"], [role="checkbox"]',
          switch: '[role="switch"]',
          radio: 'input[type="radio"], [role="radio"]'
        };

        var overlayNodes = document.querySelectorAll(OVERLAY_SEL);
        function inOverlay(el) {
          for (var k = 0; k < overlayNodes.length; k++) {
            if (overlayNodes[k].contains(el)) return true;
          }
          return false;
        }

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
            for (var i = 0; i < nodes.length; i++) {
              if (inOverlay(nodes[i])) continue;
              if (isVisible(nodes[i])) pool.push(nodes[i]);
            }
          } catch (e) {
            return { ok: false, error: 'Invalid selector: ' + (e && e.message ? e.message : String(e)) };
          }
        }

        if (!pool.length && TEXT) {
          var needle = TEXT.toLowerCase();
          var roleSel = ROLE
            ? (IMPLICIT_ROLE_SELECTORS[ROLE.toLowerCase()] || ('[role="' + ROLE + '"]'))
            : 'button, a, [role="tab"], [role="button"], [role="link"], [role="menuitem"], [role="option"], [role="switch"], [role="checkbox"], summary, label, input[type="button"], input[type="submit"]';
          var candidates = document.querySelectorAll(roleSel);
          var exact = [], contains = [];
          for (var j = 0; j < candidates.length; j++) {
            var el = candidates[j];
            if (inOverlay(el)) continue;
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

  const scrollArgs = parseScrollDeltas(args)
  if (!scrollArgs.ok) {
    return jsonResult({ ok: false, error: scrollArgs.error })
  }
  const { deltaX, deltaY } = scrollArgs

  try {
    const pos = await win.webContents.executeJavaScript(
      `
      (function () {
        // html/body/#root are overflow:hidden in this app, so window.scrollBy
        // is a no-op. Find the actual scroll container: prefer the known shell
        // scroller, then the nearest scrollable ancestor of the viewport
        // center, then fall back to documentElement so we never silently lie.
        function isScrollable(el) {
          if (!el || !(el instanceof Element)) return false
          if (el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth) return false
          var cs = window.getComputedStyle(el)
          var oy = cs.overflowY, ox = cs.overflowX
          return oy === 'auto' || oy === 'scroll' || ox === 'auto' || ox === 'scroll'
        }

        function pickTarget() {
          var named = document.querySelector('.main-content__inner')
          if (isScrollable(named)) return named
          var hit = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)
          while (hit) {
            if (isScrollable(hit)) return hit
            hit = hit.parentElement
          }
          return document.scrollingElement || document.documentElement
        }

        var t = pickTarget()
        var beforeY = t.scrollTop, beforeX = t.scrollLeft
        if (typeof t.scrollBy === 'function') {
          t.scrollBy({ left: ${deltaX}, top: ${deltaY}, behavior: 'auto' })
        } else {
          t.scrollTop = beforeY + ${deltaY}
          t.scrollLeft = beforeX + ${deltaX}
        }
        return {
          scrollTarget: t === document.scrollingElement || t === document.documentElement
            ? 'document'
            : (t.className ? '.' + String(t.className).split(/\\s+/).filter(Boolean).join('.') : t.tagName.toLowerCase()),
          scrollX: t.scrollLeft,
          scrollY: t.scrollTop,
          deltaScrolledY: t.scrollTop - beforeY,
          deltaScrolledX: t.scrollLeft - beforeX,
          clientHeight: t.clientHeight,
          scrollHeight: t.scrollHeight,
        }
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
