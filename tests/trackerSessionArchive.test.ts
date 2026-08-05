import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  archiveTrackerSessionAt,
  clearActiveTrackerSessionAt,
  getActiveTrackerDbPathForDir,
  getArchivedTrackerDbPath,
  hasArchivedTrackerSessionAt,
  removeArchivedTrackerSessionAt,
  restoreTrackerSessionAt,
} from '../electron/tracker/sessionArchiveFiles'

let tempDir: string

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finocurve-tracker-archive-'))
})

afterEach(() => {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
})

describe('tracker session archive', () => {
  it('archives active tracker DB per email and clears the active path', () => {
    const active = getActiveTrackerDbPathForDir(tempDir)
    fs.writeFileSync(active, 'goals-for-a')
    fs.writeFileSync(path.join(tempDir, 'finocurve-tracker-sync-meta.json'), '{"lastLocalMutationAt":"t1"}')

    archiveTrackerSessionAt(tempDir, 'A@Example.com')

    expect(fs.existsSync(active)).toBe(false)
    expect(fs.existsSync(getArchivedTrackerDbPath('a@example.com', tempDir))).toBe(true)
    expect(fs.readFileSync(getArchivedTrackerDbPath('A@Example.com', tempDir), 'utf-8')).toBe('goals-for-a')
    expect(hasArchivedTrackerSessionAt(tempDir, 'a@example.com')).toBe(true)
    expect(
      fs.readFileSync(path.join(tempDir, 'finocurve-tracker-sync-meta.user.a@example.com.json'), 'utf-8'),
    ).toBe('{"lastLocalMutationAt":"t1"}')
  })

  it('does not leak one profile goals into another profile session', () => {
    const active = getActiveTrackerDbPathForDir(tempDir)
    fs.writeFileSync(active, 'goals-for-a')
    archiveTrackerSessionAt(tempDir, 'a@example.com')

    // Profile B signs in with no archive — active must stay empty.
    expect(hasArchivedTrackerSessionAt(tempDir, 'b@example.com')).toBe(false)
    clearActiveTrackerSessionAt(tempDir)
    restoreTrackerSessionAt(tempDir, 'b@example.com')
    expect(fs.existsSync(active)).toBe(false)

    // Switching back to A restores only A's tracker DB.
    clearActiveTrackerSessionAt(tempDir)
    restoreTrackerSessionAt(tempDir, 'a@example.com')
    expect(fs.readFileSync(active, 'utf-8')).toBe('goals-for-a')
  })

  it('removes archived tracker DB when an account is deleted', () => {
    const active = getActiveTrackerDbPathForDir(tempDir)
    fs.writeFileSync(active, 'goals-for-a')
    archiveTrackerSessionAt(tempDir, 'a@example.com')

    removeArchivedTrackerSessionAt(tempDir, 'a@example.com')

    expect(hasArchivedTrackerSessionAt(tempDir, 'a@example.com')).toBe(false)
    expect(fs.existsSync(getArchivedTrackerDbPath('a@example.com', tempDir))).toBe(false)
  })

  it('clears active tracker without touching archives', () => {
    const active = getActiveTrackerDbPathForDir(tempDir)
    fs.writeFileSync(active, 'goals-for-a')
    archiveTrackerSessionAt(tempDir, 'a@example.com')
    restoreTrackerSessionAt(tempDir, 'a@example.com')

    clearActiveTrackerSessionAt(tempDir)

    expect(fs.existsSync(active)).toBe(false)
    expect(fs.readFileSync(getArchivedTrackerDbPath('a@example.com', tempDir), 'utf-8')).toBe('goals-for-a')
  })

  it('also removes WAL/SHM sidecars when clearing active', () => {
    const active = getActiveTrackerDbPathForDir(tempDir)
    fs.writeFileSync(active, 'db')
    fs.writeFileSync(`${active}-wal`, 'wal')
    fs.writeFileSync(`${active}-shm`, 'shm')

    clearActiveTrackerSessionAt(tempDir)

    expect(fs.existsSync(active)).toBe(false)
    expect(fs.existsSync(`${active}-wal`)).toBe(false)
    expect(fs.existsSync(`${active}-shm`)).toBe(false)
  })
})
