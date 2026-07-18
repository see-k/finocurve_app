export type ExpertToolCategory =
  | 'Portfolio'
  | 'Documents'
  | 'Research'
  | 'Tracker'
  | 'Creation'
  | 'Workspace'
  | 'Enterprise'
  | 'Connected'

export interface ExpertToolDefinition {
  name: string
  label: string
  description: string
  category: ExpertToolCategory
  /** Tools with side effects are called out explicitly in the expert editor. */
  mutatesData?: boolean
}

/**
 * Stable metadata for FinoCurve tools. The model still receives the authoritative
 * runtime tool description; this catalog exists for human-friendly permission UI.
 */
export const BUILT_IN_EXPERT_TOOLS: ExpertToolDefinition[] = [
  {
    name: 'get_portfolio_summary',
    label: 'Portfolio overview',
    description: 'Read total value, performance, risk, and top holdings.',
    category: 'Portfolio',
  },
  {
    name: 'get_holdings',
    label: 'Portfolio holdings',
    description: 'Read the complete holdings and allocation breakdown.',
    category: 'Portfolio',
  },
  {
    name: 'get_user_loans',
    label: 'Loans and liabilities',
    description: 'Read recorded loans, terms, rates, and payments.',
    category: 'Portfolio',
  },
  {
    name: 'get_risk_metrics',
    label: 'Risk analysis',
    description: 'Read the latest portfolio risk metrics and observations.',
    category: 'Portfolio',
  },
  {
    name: 'get_document_list',
    label: 'Document library',
    description: 'See which source documents are available.',
    category: 'Documents',
  },
  {
    name: 'get_agent_workspace_files',
    label: 'Private workspace files',
    description: 'See files stored in this expert’s private local workspace.',
    category: 'Documents',
  },
  {
    name: 'get_agent_workspace_file_content',
    label: 'Read private workspace files',
    description: 'Retrieve and analyze a file from this expert’s private workspace.',
    category: 'Documents',
  },
  {
    name: 'get_document_content',
    label: 'Read documents',
    description: 'Open and analyze content from a selected document.',
    category: 'Documents',
  },
  {
    name: 'get_report_list',
    label: 'Report library',
    description: 'See which saved risk reports are available.',
    category: 'Documents',
  },
  {
    name: 'get_report_content',
    label: 'Read reports',
    description: 'Open and analyze a selected saved report.',
    category: 'Documents',
  },
  {
    name: 'get_congressional_trades',
    label: 'Congressional trades',
    description: 'Research cached Senate and House financial disclosures.',
    category: 'Research',
  },
  {
    name: 'get_sec_filings',
    label: 'SEC filing search',
    description: 'Find EDGAR filings for a company or CIK.',
    category: 'Research',
  },
  {
    name: 'get_sec_filing_content',
    label: 'Read SEC filings',
    description: 'Fetch and analyze the full text of a filing.',
    category: 'Research',
  },
  {
    name: 'get_current_datetime',
    label: 'Current date and time',
    description: 'Use the device clock for date-sensitive answers.',
    category: 'Research',
  },
  {
    name: 'get_net_worth_log',
    label: 'Net worth history',
    description: 'Read logged net worth entries and trends.',
    category: 'Tracker',
  },
  {
    name: 'add_net_worth_entry',
    label: 'Log net worth',
    description: 'Add a new entry to the net worth tracker.',
    category: 'Tracker',
    mutatesData: true,
  },
  {
    name: 'get_tracker_goals',
    label: 'Financial goals',
    description: 'Read goals and their estimated progress.',
    category: 'Tracker',
  },
  {
    name: 'create_tracker_goal',
    label: 'Create goals',
    description: 'Create a new financial goal in Tracker.',
    category: 'Tracker',
    mutatesData: true,
  },
  {
    name: 'update_tracker_goal',
    label: 'Update goals',
    description: 'Modify existing financial goals and progress sources.',
    category: 'Tracker',
    mutatesData: true,
  },
  {
    name: 'save_custom_branded_report_pdf',
    label: 'Create PDF reports',
    description: 'Generate and save branded reports with tables and charts.',
    category: 'Creation',
    mutatesData: true,
  },
  {
    name: 'save_custom_csv_document',
    label: 'Create CSV exports',
    description: 'Generate and save spreadsheet-friendly CSV files.',
    category: 'Creation',
    mutatesData: true,
  },
  {
    name: 'suggest_conversation_follow_ups',
    label: 'Suggested follow-ups',
    description: 'Offer relevant next-question buttons after an answer.',
    category: 'Workspace',
  },
  {
    name: 'get_enterprise_balances',
    label: 'Enterprise balances',
    description: 'Read consolidated account balances across connected institutions from Finocurve Service.',
    category: 'Enterprise',
  },
  {
    name: 'get_enterprise_transactions',
    label: 'Enterprise activity',
    description: 'Read recent institutional transactions across enrolled accounts from Finocurve Service.',
    category: 'Enterprise',
  },
  {
    name: 'get_enterprise_connection_health',
    label: 'Enterprise connection health',
    description: 'Check live status of each Finocurve Service data provider.',
    category: 'Enterprise',
  },
  {
    name: 'get_enterprise_balance_history',
    label: 'Enterprise balance history',
    description: 'Read recorded consolidated balance snapshots over time from Finocurve Service.',
    category: 'Enterprise',
  },
]

export const EXPERT_TOOL_CATEGORIES: ExpertToolCategory[] = [
  'Portfolio',
  'Documents',
  'Research',
  'Tracker',
  'Creation',
  'Workspace',
  'Enterprise',
  'Connected',
]

export function humanizeToolName(name: string): string {
  return name
    .replace(/^app_browser_/, 'workspace ')
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function mergeExpertToolDefinitions(
  runtimeTools: { name: string; description?: string }[],
  options?: { includeEnterprise?: boolean },
): ExpertToolDefinition[] {
  const runtimeByName = new Map(runtimeTools.map((tool) => [tool.name, tool]))
  const builtIns = BUILT_IN_EXPERT_TOOLS
    .filter((tool) => options?.includeEnterprise || tool.category !== 'Enterprise')
    .map((tool) => ({
      ...tool,
      description: runtimeByName.get(tool.name)?.description || tool.description,
    }))
  const knownNames = new Set(builtIns.map((tool) => tool.name))
  const connected = runtimeTools
    .filter((tool) => !knownNames.has(tool.name))
    .map((tool) => ({
      name: tool.name,
      label: humanizeToolName(tool.name),
      description: tool.description || 'Capability supplied by a connected MCP server.',
      category: tool.name.startsWith('app_browser_') ? 'Workspace' as const : 'Connected' as const,
      mutatesData: /create|update|delete|save|write|navigate|click/i.test(tool.name),
    }))

  return [...builtIns, ...connected]
}
