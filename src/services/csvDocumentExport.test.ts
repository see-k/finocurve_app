import { describe, expect, it } from 'vitest'
import { buildCsvDocument, escapeCsvField, safeCsvBaseName } from './csvDocumentExport'

describe('escapeCsvField', () => {
  it('quotes fields containing commas, quotes, or newlines', () => {
    expect(escapeCsvField('plain')).toBe('plain')
    expect(escapeCsvField('a,b')).toBe('"a,b"')
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""')
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"')
    expect(escapeCsvField('a\r\nb')).toBe('"a\nb"')
  })
})

describe('buildCsvDocument', () => {
  it('builds RFC 4180 rows with CRLF line endings', () => {
    const csv = buildCsvDocument({
      headers: ['Symbol', 'Value'],
      rows: [['AAPL', '150'], ['MSFT', '300']],
    })
    expect(csv).toBe('Symbol,Value\r\nAAPL,150\r\nMSFT,300')
  })

  it('pads short rows and rejects empty headers', () => {
    const csv = buildCsvDocument({
      headers: ['A', 'B'],
      rows: [['only-a']],
    })
    expect(csv).toBe('A,B\r\nonly-a,')
    expect(() => buildCsvDocument({ headers: [], rows: [] })).toThrow('at least one column header')
  })

  it('enforces column and row limits', () => {
    const headers = Array.from({ length: 60 }, (_, i) => `H${i}`)
    const rows = Array.from({ length: 2500 }, () => ['x'])
    const csv = buildCsvDocument({ headers, rows })
    const lines = csv.split('\r\n')
    expect(lines[0].split(',')).toHaveLength(50)
    expect(lines).toHaveLength(2001)
  })
})

describe('safeCsvBaseName', () => {
  it('sanitizes titles for filesystem-safe CSV names', () => {
    expect(safeCsvBaseName('Q4 Holdings Report!')).toBe('Q4_Holdings_Report')
    expect(safeCsvBaseName('')).toBe('Report')
  })
})
