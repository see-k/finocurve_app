import { describe, expect, it } from 'vitest'
import {
  buildAiCsvFileName,
  buildAiDocumentKey,
  buildAiReportFileName,
  formatDualStorageSaveMessage,
  recordStorageAttempt,
} from './aiDocumentSaveHelpers'

describe('recordStorageAttempt', () => {
  it('tracks partial success when only one destination succeeds', () => {
    const attempt = { notes: [] as string[], savedAny: false }
    recordStorageAttempt(attempt, 'Local', false, 'disk full')
    recordStorageAttempt(attempt, 'Cloud', true, 'Uploaded to cloud (S3): finocurve/documents/report.pdf')

    expect(attempt.savedAny).toBe(true)
    expect(attempt.notes).toEqual([
      'Local: disk full',
      'Cloud: Uploaded to cloud (S3): finocurve/documents/report.pdf',
    ])
  })
})

describe('formatDualStorageSaveMessage', () => {
  it('returns failure guidance when nothing was saved', () => {
    const message = formatDualStorageSaveMessage({
      savedAny: false,
      notes: ['Local: EACCES', 'Cloud: not configured'],
      failureMessage: 'Could not save the PDF.',
      successIntro: 'Custom report PDF created.',
      successFooter: 'Listed under finocurve/documents/.',
    })

    expect(message).toContain('Could not save the PDF.')
    expect(message).toContain('Local: EACCES')
    expect(message).toContain('Settings > Cloud Storage')
  })

  it('returns success lines when at least one destination saved', () => {
    const message = formatDualStorageSaveMessage({
      savedAny: true,
      notes: ['Saved locally: finocurve/documents/report.pdf'],
      failureMessage: 'Could not save the CSV.',
      successIntro: 'CSV file created (UTF-8 with BOM for Excel).',
      successFooter: 'The file is listed under finocurve/documents/.',
    })

    expect(message).toBe(
      [
        'CSV file created (UTF-8 with BOM for Excel).',
        'Saved locally: finocurve/documents/report.pdf',
        'The file is listed under finocurve/documents/.',
      ].join('\n')
    )
  })
})

describe('AI document naming helpers', () => {
  it('builds stable document keys and file names', () => {
    expect(buildAiDocumentKey('FinoCurve_AI_Report_2026-06-30_Q4.pdf')).toBe(
      'finocurve/documents/FinoCurve_AI_Report_2026-06-30_Q4.pdf'
    )
    expect(buildAiReportFileName('2026-06-30', 'Q4_Holdings')).toBe(
      'FinoCurve_AI_Report_2026-06-30_Q4_Holdings.pdf'
    )
    expect(buildAiCsvFileName('2026-06-30', 'Holdings')).toBe(
      'FinoCurve_AI_Data_2026-06-30_Holdings.csv'
    )
  })
})
