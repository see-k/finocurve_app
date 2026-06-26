import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseMCPConfig } from './mcpConfigParser'

describe('parseMCPConfig', () => {
  let tempDir: string | null = null

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true })
      tempDir = null
    }
  })

  function writeConfig(name: string, content: unknown): string {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-config-'))
    const filePath = path.join(tempDir, name)
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf-8')
    return filePath
  }

  it('returns an error when the config file is missing', () => {
    const result = parseMCPConfig('/tmp/does-not-exist-mcp-config.json')
    expect(result.servers).toEqual([])
    expect(result.error).toContain('File not found')
  })

  it('returns an error for invalid JSON', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-config-'))
    const filePath = path.join(tempDir, 'bad.json')
    fs.writeFileSync(filePath, '{ not json', 'utf-8')
    const result = parseMCPConfig(filePath)
    expect(result.servers).toEqual([])
    expect(result.error).toContain('Invalid JSON')
  })

  it('requires a top-level mcpServers object', () => {
    const filePath = writeConfig('missing-root.json', { servers: {} })
    const result = parseMCPConfig(filePath)
    expect(result.servers).toEqual([])
    expect(result.error).toContain('missing "mcpServers"')
  })

  it('rejects mcpServers when it is not an object', () => {
    const filePath = writeConfig('array-root.json', { mcpServers: [] })
    const result = parseMCPConfig(filePath)
    expect(result.servers).toEqual([])
    expect(result.error).toContain('missing "mcpServers"')
  })

  it('parses valid server definitions and skips invalid entries', () => {
    const filePath = writeConfig('valid.json', {
      mcpServers: {
        filesystem: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
          env: { KEY: 'VALUE' },
        },
        emptyCommand: { command: '   ' },
        notAnObject: 'skip-me',
        missingCommand: { args: ['noop'] },
      },
    })

    const result = parseMCPConfig(filePath)
    expect(result.error).toBeUndefined()
    expect(result.servers).toEqual([
      {
        name: 'filesystem',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        env: { KEY: 'VALUE' },
      },
    ])
  })

  it('defaults args to [] and omits env when absent or invalid', () => {
    const filePath = writeConfig('minimal.json', {
      mcpServers: {
        bare: { command: '/usr/local/bin/mcp-server' },
        badEnv: { command: 'node', env: ['not', 'an', 'object'] },
      },
    })

    const result = parseMCPConfig(filePath)
    expect(result.error).toBeUndefined()
    expect(result.servers).toEqual([
      { name: 'bare', command: '/usr/local/bin/mcp-server', args: [] },
      { name: 'badEnv', command: 'node', args: [] },
    ])
  })

  it('returns an error when no valid servers remain after filtering', () => {
    const filePath = writeConfig('empty-valid.json', {
      mcpServers: {
        broken: { command: '' },
      },
    })
    const result = parseMCPConfig(filePath)
    expect(result.servers).toEqual([])
    expect(result.error).toContain('No valid servers found')
  })
})
