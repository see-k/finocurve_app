/**
 * Renderer helpers for per-email Tracker DB archive/restore.
 * No-ops gracefully when Electron tracker IPC is unavailable (web/dev).
 */

async function invoke(
  method:
    | 'trackerArchiveForEmail'
    | 'trackerHasArchiveForEmail'
    | 'trackerRestoreForEmail'
    | 'trackerClearActive'
    | 'trackerRemoveArchiveForEmail',
  email?: string,
): Promise<{ ok: boolean; hasArchive?: boolean }> {
  const api = window.electronAPI
  const fn = api?.[method]
  if (typeof fn !== 'function') return { ok: true, hasArchive: false }
  try {
    if (method === 'trackerClearActive') {
      return await (fn as () => Promise<{ ok: boolean }>)()
    }
    return await (fn as (email: string) => Promise<{ ok: boolean; hasArchive?: boolean }>)(email ?? '')
  } catch {
    return { ok: false, hasArchive: false }
  }
}

/** Archive active tracker DB for email, then clear active (sign-out). */
export async function archiveTrackerSessionForEmail(email: string): Promise<void> {
  const em = email.trim()
  if (!em) {
    await invoke('trackerClearActive')
    return
  }
  await invoke('trackerArchiveForEmail', em)
}

/** Clear active tracker; restore this email's archive when present (sign-in). */
export async function restoreOrClearTrackerSessionForEmail(email: string): Promise<void> {
  const em = email.trim()
  if (!em) {
    await invoke('trackerClearActive')
    return
  }
  const { hasArchive } = await invoke('trackerHasArchiveForEmail', em)
  if (hasArchive) {
    await invoke('trackerRestoreForEmail', em)
  } else {
    await invoke('trackerClearActive')
  }
}

/** Clear active tracker only (new signup). */
export async function clearActiveTrackerSession(): Promise<void> {
  await invoke('trackerClearActive')
}

/** Delete a profile's archived tracker DB (delete account). */
export async function removeArchivedTrackerSessionForEmail(email: string): Promise<void> {
  const em = email.trim()
  if (!em) return
  await invoke('trackerRemoveArchiveForEmail', em)
}
