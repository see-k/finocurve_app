/**
 * Build RFC 4180–style CSV for AI-exported tabular data (opens cleanly in Excel / Sheets).
 */

import { safeReportFileSlug } from './brandedCustomReportPdf'

const MAX_COLUMNS = 50
const MAX_ROWS = 2000
const MAX_CELL_CHARS = 8000

/** Escape and quote a single CSV field. */
export function escapeCsvField(value: string): string {
  const s = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export interface BuildCsvOptions {
  headers: string[]
  rows: string[][]
}

/**
 * Returns CSV text (no BOM). Caller may prepend \uFEFF for Excel UTF-8 recognition on Windows.
 */
export function buildCsvDocument(opts: BuildCsvOptions): string {
  const headers = opts.headers.slice(0, MAX_COLUMNS).map((h) => String(h ?? '').slice(0, MAX_CELL_CHARS))
  const colCount = headers.length
  if (colCount === 0) {
    throw new Error('CSV requires at least one column header.')
  }

  const lines: string[] = [headers.map(escapeCsvField).join(',')]

  const rawRows = opts.rows.slice(0, MAX_ROWS)
  for (const row of rawRows) {
    const cells: string[] = []
    for (let c = 0; c < colCount; c++) {
      const v = row[c]
      cells.push(escapeCsvField(v != null ? String(v).slice(0, MAX_CELL_CHARS) : ''))
    }
    lines.push(cells.join(','))
  }

  return lines.join('\r\n')
}

export function safeCsvBaseName(name: string): string {
  return safeReportFileSlug(name, 64)
}
