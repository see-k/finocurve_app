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
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { APP_PACKAGE_VERSION } from './appPackageVersion'

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
const serverStatuses = new Map<string, MCPServerStatusInfo>()
const COMMON_PATH_SEGMENTS = [
  '/opt/homebrew/bin',
  '/opt/homebrew/sbin',
  '/usr/local/bin',
  '/usr/local/sbin',
  '/Library/Frameworks/Python.framework/Versions/Current/bin',
]

let cachedLoginShellPath: string | null | undefined

function getLoginShellPath(): string | undefined {
  if (cachedLoginShellPath !== undefined) {
    return cachedLoginShellPath ?? undefined
  }

  if (process.platform !== 'darwin') {
    cachedLoginShellPath = null
    return undefined
  }

  const shell = process.env.SHELL || '/bin/zsh'

  try {
    const shellPath = execFileSync(shell, ['-ilc', 'printf %s "$PATH"'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: process.env.HOME || os.homedir(),
      },
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()

    cachedLoginShellPath = shellPath || null
    return cachedLoginShellPath ?? undefined
  } catch {
    cachedLoginShellPath = null
    return undefined
  }
}

function mergePathValues(...values: Array<string | undefined>): string | undefined {
  const seen = new Set<string>()
  const merged: string[] = []

  for (const value of values) {
    if (!value) continue

    for (const segment of value.split(path.delimiter)) {
      const trimmed = segment.trim()
      if (!trimmed || seen.has(trimmed)) continue
      seen.add(trimmed)
      merged.push(trimmed)
    }
  }

  return merged.length > 0 ? merged.join(path.delimiter) : undefined
}

function buildSpawnEnv(overrides?: Record<string, string>): Record<string, string> {
  const loginShellPath = getLoginShellPath()
  const mergedPath = mergePathValues(
    overrides?.PATH,
    process.env.PATH,
    loginShellPath,
    COMMON_PATH_SEGMENTS.join(path.delimiter)
  )

  return {
    ...(process.env as Record<string, string | undefined>),
    ...(overrides ?? {}),
    ...(mergedPath ? { PATH: mergedPath } : {}),
  } as Record<string, string>
}

function canExecute(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

function resolveCommand(command: string, env: Record<string, string>): string {
  if (!command.trim()) {
    throw new Error('MCP server command is empty')
  }

  if (path.isAbsolute(command) || command.includes(path.sep)) {
    return command
  }

  const pathValue = env.PATH || process.env.PATH || ''
  for (const dir of pathValue.split(path.delimiter)) {
    if (!dir) continue
    const candidate = path.join(dir, command)
    if (fs.existsSync(candidate) && canExecute(candidate)) {
      return candidate
    }
  }

  throw new Error(
    `Command "${command}" was not found in PATH. In the packaged app, configure an absolute command path or ensure your shell exposes it in PATH.`
  )
}

function setServerStatus(status: MCPServerStatusInfo): MCPServerStatusInfo {
  serverStatuses.set(status.name, status)
  return status
}

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
      statuses.push(setServerStatus({
        name: def.name,
        status: existing.status,
        error: existing.error,
      }))
      continue
    }

    let stderrOutput = ''

    try {
      const env = buildSpawnEnv(def.env)
      const command = resolveCommand(def.command, env)
      const transport = new StdioClientTransport({
        command,
        args: def.args,
        env,
        stderr: 'pipe',
      })

      transport.stderr?.setEncoding('utf8')
      transport.stderr?.on('data', (chunk) => {
        stderrOutput = `${stderrOutput}${chunk}`.slice(-4000)
      })

      const client = new Client(
        { name: 'finocurve', version: APP_PACKAGE_VERSION },
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

      statuses.push(setServerStatus({
        name: def.name,
        status: 'running',
        pid: transport.pid,
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect to server'
      const stderrMessage = stderrOutput ? stderrOutput.trim() : ''
      statuses.push(setServerStatus({
        name: def.name,
        status: 'error',
        error: stderrMessage ? `${message}\n${stderrMessage}` : message,
      }))
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
    setServerStatus({ name: entry.definition.name, status: 'stopped' })
  }
  connectedServers.clear()
}

/**
 * Get current status of all tracked servers.
 */
export function getMCPServerStatuses(): MCPServerStatusInfo[] {
  return Array.from(serverStatuses.values())
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
