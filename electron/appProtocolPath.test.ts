import { describe, expect, it } from 'vitest'
import { resolveAppProtocolRelativePath } from './appProtocolPath'

describe('resolveAppProtocolRelativePath', () => {
  it('maps root to index.html', () => {
    expect(resolveAppProtocolRelativePath('/')).toBe('index.html')
    expect(resolveAppProtocolRelativePath('')).toBe('index.html')
  })

  it('strips leading slashes from asset paths', () => {
    expect(resolveAppProtocolRelativePath('/assets/app.js')).toBe('assets/app.js')
    expect(resolveAppProtocolRelativePath('//assets/app.js')).toBe('assets/app.js')
  })

  it('blocks directory traversal after normalization', () => {
    expect(resolveAppProtocolRelativePath('/../../etc/passwd')).toBe('index.html')
    expect(resolveAppProtocolRelativePath('/assets/../../../secret')).toBe('index.html')
  })

  it('decodes percent-encoded path segments', () => {
    expect(resolveAppProtocolRelativePath('/assets/%66oo.js')).toBe('assets/foo.js')
    expect(resolveAppProtocolRelativePath('/%2e%2e%2fetc/passwd')).toBe('index.html')
  })
})
