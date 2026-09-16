const BRAND_MARKS = {
  ollama: { src: '/images/brands/ollama.svg', label: 'Ollama' },
  bedrock: { src: '/images/brands/aws.svg', label: 'AWS' },
  azure: { src: '/images/brands/azure.svg', label: 'Microsoft Azure' },
  slack: { src: '/images/brands/slack.svg', label: 'Slack' },
} as const

export type ProviderBrandId = keyof typeof BRAND_MARKS

export function ProviderBrandIcon({
  provider,
  size = 22,
}: {
  provider: ProviderBrandId
  size?: number
}) {
  const mark = BRAND_MARKS[provider]
  return (
    <span
      className={`provider-brand-icon provider-brand-icon--${provider}`}
      style={{ width: size, height: size }}
      title={mark.label}
      aria-hidden
    >
      <img src={mark.src} alt="" width={size} height={size} draggable={false} />
    </span>
  )
}

/** Opens the live Slack thread in the Slack app or browser. Slack does not offer an embeddable chat UI. */
export function SlackThreadLink({
  url,
  size = 14,
}: {
  url?: string
  size?: number
}) {
  if (!url) return null
  return (
    <a
      className="slack-thread-link"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title="Open this conversation in Slack"
      aria-label="Open this conversation in Slack"
    >
      <ProviderBrandIcon provider="slack" size={size} />
    </a>
  )
}
