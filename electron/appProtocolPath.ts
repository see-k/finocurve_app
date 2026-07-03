import path from 'node:path'

/**
 * Map an app:// request pathname to a safe relative file path under the SPA dist folder.
 * Blocks directory traversal via `..` segments after normalization.
 */
export function resolveAppProtocolRelativePath(rawPathname: string): string {
  const rawPath = decodeURIComponent(rawPathname || '/')
  const relativePath = rawPath === '/' ? 'index.html' : rawPath.replace(/^\/+/, '')
  const normalizedPath = path.normalize(relativePath)
  return normalizedPath.startsWith('..') ? 'index.html' : normalizedPath
}
