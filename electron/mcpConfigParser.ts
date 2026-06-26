import fs from 'node:fs'

export interface MCPServerDefinition {
  name: string
  command: string
  args: string[]
  env?: Record<string, string>
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
