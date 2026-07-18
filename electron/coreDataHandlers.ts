import { app, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { getCoreDataDb } from './coreDataDb'
import { CoreDataRepository } from './coreDataRepository'
import {
  normalizeCoreDataClientRecord,
  normalizeCoreDataClientRecords,
  type CoreDataClientRecord,
} from './coreDataModel'

const BACKUP_DIRECTORY = 'core-data-backups'

function writeMigrationBackup(records: CoreDataClientRecord[]): string {
  const directory = path.join(app.getPath('userData'), BACKUP_DIRECTORY)
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filePath = path.join(directory, `localstorage-${timestamp}-${randomUUID()}.json`)
  const temporaryPath = `${filePath}.tmp`
  const payload = {
    format: 'finocurve-core-data-localstorage-backup',
    version: 1,
    createdAt: new Date().toISOString(),
    records,
  }
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(payload, null, 2), { encoding: 'utf8', mode: 0o600 })
    fs.renameSync(temporaryPath, filePath)
    try { fs.chmodSync(filePath, 0o600) } catch { /* not supported on every platform */ }
    return filePath
  } catch (error) {
    try { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath) } catch { /* ignore cleanup */ }
    throw error
  }
}

export function registerCoreDataHandlers(): void {
  ipcMain.handle('core-data-bootstrap', async (_event, payload: { records?: unknown } | undefined) => {
    const records = normalizeCoreDataClientRecords(payload?.records)
    const repository = new CoreDataRepository(getCoreDataDb())
    const backupPath = repository.hasBootstrapDifferences(records) && records.some((record) => record.value !== null)
      ? writeMigrationBackup(records)
      : undefined
    return repository.reconcileBootstrap(records, backupPath)
  })

  ipcMain.handle('core-data-write', async (_event, payload: unknown) => {
    const record = normalizeCoreDataClientRecord(payload)
    const repository = new CoreDataRepository(getCoreDataDb())
    return repository.write(record)
  })
}
