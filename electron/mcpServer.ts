/**
 * MCP (Model Context Protocol) server manager.
 * Uses the official @modelcontextprotocol/sdk to connect to MCP servers via stdio,
 * list their tools, and invoke them. Manages the full lifecycle.
 *
 * Config format (claude_desktop_config.json):
 * {
 *   "mcpServers": {
 *     "serverName": {
 *       "command": "npx",
 *       "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"],
 *       "env": { "KEY": "VALUE" }
 *     }
 *   }
 * }
 */

import { Client } from '@modelcontextprotocol/sdk/client'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio'
import fs from 'node:fs'

export interface MCPServerDefinition {
  name: string
  command: string
  args: string[]
  env?: Record<string, string>
}

export interface MCPServerStatusInfo {
  name: string
  status: 'running' | 'stopped' | 'error'
  pid?: number
  error?: string
}

export interface MCPToolInfo {
  serverName: string
  name: string
  description?: string
  inputSchema: Record<string, unknown>
}

interface ConnectedServer {
  definition: MCPServerDefinition
  client: Client
  transport: StdioClientTransport
  status: 'running' | 'error'
  error?: string
  tools: MCPToolInfo[]
}

const connectedServers = new Map<string, ConnectedServer>()

/**
 * Parse Anthropic Claude Desktop MCP config format from a JSON file.
 */
export function parseMCPConfig(filePath: string): { servers: MCPServerDefinition[]; error?: string } {
  if (!fs.existsSync(filePath)) {
    return { servers: [], error: `File not found: ${filePath}` }
  }

  let raw: string
  try {
    raw = fs.readFileSync(filePath, 'utf-8')
  } catch (err) {
    return { servers: [], error: `Could not read file: ${err instanceof Error ? err.message : String(err)}` }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { servers: [], error: 'Invalid JSON: could not parse config file' }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { servers: [], error: 'Invalid config: expected a JSON object' }
  }

  const root = parsed as Record<string, unknown>
  if (!root.mcpServers || typeof root.mcpServers !== 'object' || Array.isArray(root.mcpServers)) {
    return { servers: [], error: 'Invalid config: missing "mcpServers" object' }
  }

  const mcpServers = root.mcpServers as Record<string, unknown>
  const servers: MCPServerDefinition[] = []

  for (const [name, cfg] of Object.entries(mcpServers)) {
    if (typeof cfg !== 'object' || cfg === null) continue
    const serverCfg = cfg as Record<string, unknown>
    if (typeof serverCfg.command !== 'string' || !serverCfg.command.trim()) continue
    servers.push({
      name,
      command: serverCfg.command,
      args: Array.isArray(serverCfg.args) ? (serverCfg.args as string[]) : [],
      env: typeof serverCfg.env === 'object' && serverCfg.env !== null && !Array.isArray(serverCfg.env)
        ? (serverCfg.env as Record<string, string>)
        : undefined,
    })
  }

  if (servers.length === 0) {
    return { servers: [], error: 'No valid servers found in config' }
  }

  return { servers }
}

/**
 * Start and connect to MCP servers using the MCP SDK.
 * The SDK's StdioClientTransport spawns the process and handles JSON-RPC over stdio.
 */
export async function startMCPServers(servers: MCPServerDefinition[]): Promise<MCPServerStatusInfo[]> {
  const statuses: MCPServerStatusInfo[] = []

  for (const def of servers) {
    const existing = connectedServers.get(def.name)
    if (existing) {
      statuses.push({
        name: def.name,
        status: existing.status,
        error: existing.error,
      })
      continue
    }

    try {
      const transport = new StdioClientTransport({
        command: def.command,
        args: def.args,
        env: def.env,
        stderr: 'pipe',
      })

      const client = new Client(
        { name: 'finocurve', version: '1.0.0' },
      )

      await client.connect(transport)

      // Discover tools from the server
      let tools: MCPToolInfo[] = []
      try {
        const toolsResult = await client.listTools()
        tools = toolsResult.tools.map((t) => ({
          serverName: def.name,
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema as Record<string, unknown>,
        }))
      } catch {
        // Server may not support tools — that's okay
      }

      const entry: ConnectedServer = {
        definition: def,
        client,
        transport,
        status: 'running',
        tools,
      }
      connectedServers.set(def.name, entry)

      statuses.push({ name: def.name, status: 'running' })
    } catch (err) {
      statuses.push({
        name: def.name,
        status: 'error',
        error: err instanceof Error ? err.message : 'Failed to connect to server',
      })
    }
  }

  return statuses
}

/**
 * Stop all connected MCP servers gracefully.
 */
export async function stopMCPServers(): Promise<void> {
  for (const [, entry] of connectedServers) {
    try {
      await entry.client.close()
    } catch {
      // ignore close errors
    }
  }
  connectedServers.clear()
}

/**
 * Get current status of all tracked servers.
 */
export function getMCPServerStatuses(): MCPServerStatusInfo[] {
  return Array.from(connectedServers.entries()).map(([name, entry]) => ({
    name,
    status: entry.status,
    error: entry.error,
  }))
}

/**
 * Check if any MCP servers are currently running.
 */
export function isMCPRunning(): boolean {
  return connectedServers.size > 0
}

/**
 * Get all available tools from all connected MCP servers.
 */
export function getAllMCPTools(): MCPToolInfo[] {
  const tools: MCPToolInfo[] = []
  for (const [, entry] of connectedServers) {
    if (entry.status === 'running') {
      tools.push(...entry.tools)
    }
  }
  return tools
}

/**
 * Call a tool on the appropriate MCP server.
 */
export async function callMCPTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  for (const [, entry] of connectedServers) {
    const hasTool = entry.tools.some((t) => t.name === toolName)
    if (!hasTool) continue

    const result = await entry.client.callTool({ name: toolName, arguments: args })
    // Extract text content from the MCP response
    const content = result.content
    if (Array.isArray(content)) {
      return content
        .filter((c): c is { type: 'text'; text: string } => (c as { type?: string }).type === 'text')
        .map((c) => c.text)
        .join('\n')
    }
    return typeof content === 'string' ? content : JSON.stringify(content)
  }
  throw new Error(`MCP tool "${toolName}" not found on any connected server`)
}
