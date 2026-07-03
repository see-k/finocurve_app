import fs from 'node:fs'
import path from 'node:path'
import { mergePathValues } from './mcpPathEnv'

export const COMMON_MCP_PATH_SEGMENTS = [
  '/opt/homebrew/bin',
  '/opt/homebrew/sbin',
  '/usr/local/bin',
  '/usr/local/sbin',
  '/Library/Frameworks/Python.framework/Versions/Current/bin',
]

export function buildMcpSpawnEnv(
  overrides?: Record<string, string>,
  options?: {
    loginShellPath?: string
    baseEnv?: Record<string, string | undefined>
  }
): Record<string, string> {
  const baseEnv = options?.baseEnv ?? (process.env as Record<string, string | undefined>)
  const mergedPath = mergePathValues(
    overrides?.PATH,
    baseEnv.PATH,
    options?.loginShellPath,
    COMMON_MCP_PATH_SEGMENTS.join(path.delimiter)
  )

  return {
    ...baseEnv,
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

/** Resolve a bare command name against PATH, or pass through absolute/relative paths. */
export function resolveMcpCommand(command: string, env: Record<string, string>): string {
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

/** Normalize MCP SDK tool result content into a single string for LangChain. */
export function formatMcpToolResultContent(content: unknown): string {
  if (Array.isArray(content)) {
    return content
      .filter((c): c is { type: 'text'; text: string } => (c as { type?: string }).type === 'text')
      .map((c) => c.text)
      .join('\n')
  }
  return typeof content === 'string' ? content : JSON.stringify(content)
}
