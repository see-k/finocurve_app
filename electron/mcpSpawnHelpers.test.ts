import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildMcpSpawnEnv,
  formatMcpToolResultContent,
  resolveMcpCommand,
} from './mcpSpawnHelpers'

describe('buildMcpSpawnEnv', () => {
  it('merges server PATH override ahead of base env and common segments', () => {
    const env = buildMcpSpawnEnv(
      { PATH: '/custom/bin' },
      { baseEnv: { PATH: '/usr/bin' }, loginShellPath: '/home/user/.local/bin' }
    )
    expect(env.PATH?.split(path.delimiter)).toEqual([
      '/custom/bin',
      '/usr/bin',
      '/home/user/.local/bin',
      '/opt/homebrew/bin',
      '/opt/homebrew/sbin',
      '/usr/local/bin',
      '/usr/local/sbin',
      '/Library/Frameworks/Python.framework/Versions/Current/bin',
    ])
  })

  it('preserves non-PATH overrides from the server definition', () => {
    const env = buildMcpSpawnEnv({ API_KEY: 'secret' }, { baseEnv: { HOME: '/home/user' } })
    expect(env.API_KEY).toBe('secret')
    expect(env.HOME).toBe('/home/user')
  })
})

describe('resolveMcpCommand', () => {
  let tempDir: string | null = null

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true })
      tempDir = null
    }
  })

  it('passes through absolute paths unchanged', () => {
    expect(resolveMcpCommand('/usr/local/bin/mcp-server', { PATH: '' })).toBe('/usr/local/bin/mcp-server')
  })

  it('resolves bare command names against PATH', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-cmd-'))
    const binDir = path.join(tempDir, 'bin')
    fs.mkdirSync(binDir)
    const executable = path.join(binDir, 'fake-mcp')
    fs.writeFileSync(executable, '#!/bin/sh\necho ok\n', { mode: 0o755 })

    const resolved = resolveMcpCommand('fake-mcp', { PATH: binDir })
    expect(resolved).toBe(executable)
  })

  it('throws when command is empty or not found in PATH', () => {
    expect(() => resolveMcpCommand('   ', { PATH: '/usr/bin' })).toThrow('command is empty')
    expect(() => resolveMcpCommand('missing-tool', { PATH: '/empty' })).toThrow('not found in PATH')
  })
})

describe('formatMcpToolResultContent', () => {
  it('joins text blocks from MCP content arrays', () => {
    const out = formatMcpToolResultContent([
      { type: 'text', text: 'line one' },
      { type: 'image', data: 'ignored' },
      { type: 'text', text: 'line two' },
    ])
    expect(out).toBe('line one\nline two')
  })

  it('returns string content as-is and JSON-stringifies objects', () => {
    expect(formatMcpToolResultContent('plain text')).toBe('plain text')
    expect(formatMcpToolResultContent({ ok: true, count: 2 })).toBe('{"ok":true,"count":2}')
  })
})
