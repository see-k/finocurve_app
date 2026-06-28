import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APP_ROUTE_CATALOG, APP_ROUTE_TOPIC_ALIASES } from './appBrowserRouteValidation'

const mockSend = vi.fn()
const mockExecuteJavaScript = vi.fn()
const mockCapturePage = vi.fn()
const mockIsDestroyed = vi.fn(() => false)

const mockWebContents = {
  send: mockSend,
  executeJavaScript: mockExecuteJavaScript,
  capturePage: mockCapturePage,
  isDestroyed: vi.fn(() => false),
}

const mockWindow = {
  isDestroyed: mockIsDestroyed,
  webContents: mockWebContents,
}

const getMainBrowserWindow = vi.fn(() => mockWindow)

vi.mock('./mainWindow', () => ({
  getMainBrowserWindow: () => getMainBrowserWindow(),
}))

import {
  BUILTIN_APP_BROWSER_SERVER_NAME,
  callBuiltinAppBrowserTool,
  getBuiltinAppBrowserTools,
  notifyRemoteIndicator,
} from './appBrowserTools'

describe('getBuiltinAppBrowserTools', () => {
  it('registers six finocurve-app browser tools', () => {
    const tools = getBuiltinAppBrowserTools()
    expect(tools).toHaveLength(6)
    expect(tools.every((t) => t.serverName === BUILTIN_APP_BROWSER_SERVER_NAME)).toBe(true)
    expect(tools.map((t) => t.name)).toEqual([
      'app_browser_screenshot',
      'app_browser_list_routes',
      'app_browser_navigate',
      'app_browser_click',
      'app_browser_scroll',
      'app_browser_page_text',
    ])
  })

  it('requires path on navigate', () => {
    const navigate = getBuiltinAppBrowserTools().find((t) => t.name === 'app_browser_navigate')
    expect(navigate?.inputSchema.required).toEqual(['path'])
  })
})

describe('callBuiltinAppBrowserTool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getMainBrowserWindow.mockReturnValue(mockWindow)
    mockIsDestroyed.mockReturnValue(false)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns null for unknown tools', async () => {
    await expect(callBuiltinAppBrowserTool('app_browser_unknown', {})).resolves.toBeNull()
  })

  it('returns an error when the main window is unavailable', async () => {
    getMainBrowserWindow.mockReturnValue(null)
    const result = await callBuiltinAppBrowserTool('app_browser_navigate', {
      path: '/main?tab=portfolio',
    })
    expect(JSON.parse(result!)).toEqual({
      ok: false,
      error: 'Main application window is not available.',
    })
  })

  it('list_routes still returns the catalog when currentPath cannot be read', async () => {
    getMainBrowserWindow.mockReturnValue(null)
    const result = await callBuiltinAppBrowserTool('app_browser_list_routes', {})
    const payload = JSON.parse(result!)

    expect(payload.ok).toBe(true)
    expect(payload.currentPath).toBeNull()
    expect(payload.routes).toEqual(APP_ROUTE_CATALOG)
  })

  it('list_routes returns catalog, aliases, and current path', async () => {
    mockExecuteJavaScript.mockResolvedValueOnce('/main?tab=portfolio')

    const result = await callBuiltinAppBrowserTool('app_browser_list_routes', {})
    const payload = JSON.parse(result!)

    expect(payload.ok).toBe(true)
    expect(payload.currentPath).toBe('/main?tab=portfolio')
    expect(payload.routes).toEqual(APP_ROUTE_CATALOG)
    expect(payload.topicAliases).toEqual(APP_ROUTE_TOPIC_ALIASES)
    expect(payload.note).toContain('app_browser_navigate')
  })

  it('navigate rejects missing path before touching the renderer', async () => {
    const result = await callBuiltinAppBrowserTool('app_browser_navigate', {})
    const payload = JSON.parse(result!)

    expect(payload.ok).toBe(false)
    expect(payload.error).toContain('Missing or invalid "path"')
    expect(mockExecuteJavaScript).not.toHaveBeenCalled()
  })

  it('navigate rejects unknown tabs with a suggestion instead of silently falling back', async () => {
    const result = await callBuiltinAppBrowserTool('app_browser_navigate', {
      path: '/main?tab=documents',
    })
    const payload = JSON.parse(result!)

    expect(payload.ok).toBe(false)
    expect(payload.requestedPath).toBe('/main?tab=documents')
    expect(payload.error).toContain('Unknown /main tab "documents"')
    expect(payload.suggestion).toBe('/main?tab=reports')
    expect(mockExecuteJavaScript).not.toHaveBeenCalled()
  })

  it('navigate reports success when path and nav label match', async () => {
    vi.useFakeTimers()
    mockExecuteJavaScript
      .mockResolvedValueOnce('http://localhost/#/main?tab=portfolio')
      .mockResolvedValueOnce({
        currentPath: '/main?tab=portfolio',
        activeNavLabel: 'Portfolio',
      })

    const promise = callBuiltinAppBrowserTool('app_browser_navigate', {
      path: '/main?tab=portfolio',
    })
    await vi.runAllTimersAsync()
    const result = await promise
    const payload = JSON.parse(result!)

    expect(payload.ok).toBe(true)
    expect(payload.requestedPath).toBe('/main?tab=portfolio')
    expect(payload.currentPath).toBe('/main?tab=portfolio')
    expect(payload.activeNavLabel).toBe('Portfolio')
  })

  it('click rejects missing text and selector', async () => {
    const result = await callBuiltinAppBrowserTool('app_browser_click', {})
    const payload = JSON.parse(result!)

    expect(payload.ok).toBe(false)
    expect(payload.error).toContain('Provide either "text" or "selector"')
    expect(mockExecuteJavaScript).not.toHaveBeenCalled()
  })

  it('scroll rejects zero deltas', async () => {
    const result = await callBuiltinAppBrowserTool('app_browser_scroll', { deltaY: 0, deltaX: 0 })
    const payload = JSON.parse(result!)

    expect(payload.ok).toBe(false)
    expect(payload.error).toContain('non-zero')
    expect(mockExecuteJavaScript).not.toHaveBeenCalled()
  })
})

describe('notifyRemoteIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getMainBrowserWindow.mockReturnValue(mockWindow)
    mockIsDestroyed.mockReturnValue(false)
  })

  it('sends IPC on the remote indicator channel', () => {
    notifyRemoteIndicator('start', 'app_browser_navigate')
    expect(mockSend).toHaveBeenCalledWith('app-browser-remote-indicator', {
      phase: 'start',
      toolName: 'app_browser_navigate',
    })
  })

  it('no-ops when the window is destroyed', () => {
    mockIsDestroyed.mockReturnValue(true)
    notifyRemoteIndicator('end', 'app_browser_list_routes')
    expect(mockSend).not.toHaveBeenCalled()
  })
})

describe('withRemoteIndicator timing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getMainBrowserWindow.mockReturnValue(mockWindow)
    mockIsDestroyed.mockReturnValue(false)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not show the HUD for fast list_routes calls', async () => {
    mockExecuteJavaScript.mockResolvedValueOnce('/main')

    const promise = callBuiltinAppBrowserTool('app_browser_list_routes', {})
    await vi.runAllTimersAsync()
    await promise

    expect(mockSend).not.toHaveBeenCalled()
  })

  it('shows and hides the HUD for slow tools', async () => {
    mockExecuteJavaScript.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve('/main?tab=portfolio'), 200))
    )

    const promise = callBuiltinAppBrowserTool('app_browser_list_routes', {})
    await vi.advanceTimersByTimeAsync(120)
    expect(mockSend).toHaveBeenCalledWith('app-browser-remote-indicator', {
      phase: 'start',
      toolName: 'app_browser_list_routes',
    })

    await vi.runAllTimersAsync()
    await promise

    expect(mockSend).toHaveBeenCalledWith('app-browser-remote-indicator', {
      phase: 'end',
      toolName: 'app_browser_list_routes',
    })
  })

  it('holds the HUD open for the minimum visible duration', async () => {
    mockExecuteJavaScript.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve('/main'), 130))
    )

    const promise = callBuiltinAppBrowserTool('app_browser_list_routes', {})
    await vi.advanceTimersByTimeAsync(120)
    await vi.advanceTimersByTimeAsync(15)
    expect(mockSend).toHaveBeenCalledTimes(1)

    await vi.runAllTimersAsync()
    await promise

    expect(mockSend).toHaveBeenLastCalledWith('app-browser-remote-indicator', {
      phase: 'end',
      toolName: 'app_browser_list_routes',
    })
  })
})
