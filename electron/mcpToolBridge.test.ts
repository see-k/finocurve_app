import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MCPToolInfo } from './mcpServer'

const mockGetAllMCPTools = vi.fn<() => MCPToolInfo[]>()
const mockCallMCPTool = vi.fn<(name: string, args: Record<string, unknown>) => Promise<string>>()

vi.mock('./mcpServer', () => ({
  getAllMCPTools: () => mockGetAllMCPTools(),
  callMCPTool: (name: string, args: Record<string, unknown>) => mockCallMCPTool(name, args),
}))

import { getMCPLangChainTools } from './mcpToolBridge'

describe('getMCPLangChainTools', () => {
  beforeEach(() => {
    mockGetAllMCPTools.mockReset()
    mockCallMCPTool.mockReset()
  })

  it('returns an empty array when no MCP tools are registered', () => {
    mockGetAllMCPTools.mockReturnValue([])
    expect(getMCPLangChainTools()).toEqual([])
  })

  it('binds MCP tool metadata and validates required args via Zod schema', async () => {
    mockGetAllMCPTools.mockReturnValue([
      {
        serverName: 'builtin',
        name: 'app_browser_navigate',
        description: 'Navigate the in-app browser',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
        },
      },
      {
        serverName: 'builtin',
        name: 'app_browser_screenshot',
        description: 'Capture a screenshot',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            scaleFactor: { type: 'number' },
          },
          required: ['path'],
        },
      },
    ])
    mockCallMCPTool.mockResolvedValue('{"ok":true}')

    const tools = getMCPLangChainTools()
    expect(tools).toHaveLength(2)
    expect(tools[0].name).toBe('app_browser_navigate')
    expect(tools[1].name).toBe('app_browser_screenshot')

    await expect(tools[0].invoke({})).rejects.toThrow()
    await expect(tools[0].invoke({ path: '/main?tab=portfolio' })).resolves.toBe('{"ok":true}')
    expect(mockCallMCPTool).toHaveBeenCalledWith('app_browser_navigate', { path: '/main?tab=portfolio' })

    await expect(tools[1].invoke({ path: '/main' })).resolves.toBe('{"ok":true}')
    await expect(tools[1].invoke({ path: '/main', scaleFactor: 0.5 })).resolves.toBe('{"ok":true}')
  })

  it('accepts empty args for tools with no input properties', async () => {
    mockGetAllMCPTools.mockReturnValue([
      {
        serverName: 'builtin',
        name: 'app_browser_list_routes',
        description: 'List routes',
        inputSchema: { type: 'object', properties: {} },
      },
    ])
    mockCallMCPTool.mockResolvedValue('[]')

    const [tool] = getMCPLangChainTools()
    await expect(tool.invoke({})).resolves.toBe('[]')
    expect(mockCallMCPTool).toHaveBeenCalledWith('app_browser_list_routes', {})
  })
})
