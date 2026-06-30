const DOCUMENTS_PREFIX = 'finocurve/documents/'

export interface DualStorageSaveAttempt {
  notes: string[]
  savedAny: boolean
}

/** Record the outcome of a local or cloud save attempt for AI-generated documents. */
export function recordStorageAttempt(
  attempt: DualStorageSaveAttempt,
  location: 'Local' | 'Cloud',
  success: boolean,
  detail: string
): void {
  attempt.notes.push(`${location}: ${detail}`)
  if (success) attempt.savedAny = true
}

/** Build the user-facing message after trying local and optional cloud storage. */
export function formatDualStorageSaveMessage(params: {
  savedAny: boolean
  notes: string[]
  failureMessage: string
  successIntro: string
  successFooter: string
}): string {
  const { savedAny, notes, failureMessage, successIntro, successFooter } = params
  if (!savedAny) {
    return `${failureMessage} ${notes.join(' ')} Ask the user to configure local storage and/or S3 under Settings > Cloud Storage.`
  }
  return [successIntro, ...notes, successFooter].join('\n')
}

export function buildAiDocumentKey(fileName: string): string {
  return `${DOCUMENTS_PREFIX}${fileName}`
}

export function buildAiReportFileName(dateStr: string, titleSlug: string): string {
  return `FinoCurve_AI_Report_${dateStr}_${titleSlug}.pdf`
}

export function buildAiCsvFileName(dateStr: string, baseSlug: string): string {
  return `FinoCurve_AI_Data_${dateStr}_${baseSlug}.csv`
}
