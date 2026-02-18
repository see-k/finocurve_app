/**
 * Document parser - extracts text from PDF and other formats.
 * Uses pdf-parse for PDF; plain text for .txt.
 * Worker configured for Electron (see vite.config.ts externals).
 */

import { getPath, getData } from 'pdf-parse/worker'
import { PDFParse } from 'pdf-parse'

// Configure worker for Electron - avoids "missing PDF worker module" error
try {
  PDFParse.setWorker(getData())
} catch {
  try {
    PDFParse.setWorker(getPath())
  } catch {
    /* fallback */
  }
}

function getExtension(fileName: string): string {
  const idx = fileName.lastIndexOf('.')
  return idx >= 0 ? fileName.slice(idx).toLowerCase() : ''
}

export async function extractTextFromDocument(
  buffer: Uint8Array,
  mimeType?: string,
  fileName?: string
): Promise<string> {
  const ext = fileName ? getExtension(fileName) : ''
  const mime = (mimeType || '').toLowerCase()

  if (
    ext === '.pdf' ||
    mime === 'application/pdf' ||
    (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46)
  ) {
    return extractPdfText(buffer)
  }

  if (ext === '.txt' || mime.includes('text/plain')) {
    return new TextDecoder('utf-8', { fatal: false }).decode(buffer)
  }

  if (ext === '.csv' || mime.includes('text/csv') || mime.includes('application/csv')) {
    return new TextDecoder('utf-8', { fatal: false }).decode(buffer)
  }

  return ''
}

async function extractPdfText(buffer: Uint8Array): Promise<string> {
  try {
    const parser = new PDFParse({ data: buffer })
    const result = await parser.getText()
    await parser.destroy()
    return result?.text ?? ''
  } catch (err) {
    throw new Error(`PDF extraction failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
  }
}
