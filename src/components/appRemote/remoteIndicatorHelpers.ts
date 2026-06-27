/** Human-readable label for the AI Remote HUD during in-app browser tool calls. */
export function formatRemoteToolLabel(toolName?: string): string {
  if (toolName === 'app_browser_screenshot') return 'Capturing viewport'
  if (toolName === 'app_browser_navigate') return 'Navigating'
  if (toolName === 'app_browser_scroll') return 'Scrolling'
  if (toolName === 'app_browser_page_text') return 'Reading page'
  if (toolName) return toolName.replace(/^app_browser_/, '')
  return 'Processing'
}

/** Track nested concurrent tool calls so the HUD stays visible until all finish. */
export function nextRemoteIndicatorDepth(
  depth: number,
  phase: 'start' | 'end'
): { depth: number; active: boolean; clearToolName: boolean } {
  if (phase === 'start') {
    return { depth: depth + 1, active: true, clearToolName: false }
  }
  const newDepth = Math.max(0, depth - 1)
  return { depth: newDepth, active: newDepth > 0, clearToolName: newDepth === 0 }
}
