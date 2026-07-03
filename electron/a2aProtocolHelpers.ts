import { APP_PACKAGE_VERSION } from './appPackageVersion'

export interface A2AMessagePart {
  type?: string
  kind?: string
  text?: string
  data?: unknown
  mimeType?: string
}

/** Build the agent card served at /.well-known/agent.json */
export function buildAgentCard(port: number) {
  return {
    name: 'FinoCurve AI',
    description: 'Financial risk and document analysis assistant',
    protocolVersion: '0.3.0',
    url: `http://127.0.0.1:${port}/`,
    version: APP_PACKAGE_VERSION,
    capabilities: {
      streaming: false,
      pushNotifications: false,
    },
    skills: [
      {
        id: 'financial-analysis',
        name: 'Financial Analysis',
        description:
          'Analyze financial documents, assess risk, provide portfolio insights, and answer questions about finance',
      },
    ],
    defaultInputModes: ['text'],
    defaultOutputModes: ['text'],
    supportsAuthenticatedExtendedCard: false,
  }
}

/** Extract text from A2A message parts (handles both `type` and `kind` fields). */
export function extractTextFromA2AParts(parts: A2AMessagePart[]): string {
  return parts
    .filter((p) => (p.type === 'text' || p.kind === 'text') && p.text)
    .map((p) => p.text!)
    .join('\n')
}
