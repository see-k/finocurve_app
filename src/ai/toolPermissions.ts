export interface ExpertToolPolicy {
  toolAccess?: 'all' | 'selected' | 'none'
  enabledToolNames?: string[]
}

/** Legacy/unspecified profiles intentionally retain full tool access. */
export function isExpertToolAllowed(
  policy: ExpertToolPolicy | null | undefined,
  toolName: string,
): boolean {
  if (!policy?.toolAccess || policy.toolAccess === 'all') return true
  if (policy.toolAccess === 'none') return false
  return new Set(policy.enabledToolNames ?? []).has(toolName)
}

export function filterExpertTools<T extends { name: string }>(
  tools: T[],
  policy: ExpertToolPolicy | null | undefined,
): T[] {
  return tools.filter((tool) => isExpertToolAllowed(policy, tool.name))
}
