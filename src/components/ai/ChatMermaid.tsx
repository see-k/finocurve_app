import { useEffect, useId, useState } from 'react'

type RenderState =
  | { status: 'loading' }
  | { status: 'ready'; svg: string }
  | { status: 'error'; message: string }

let mermaidInit: Promise<typeof import('mermaid').default> | null = null

async function getMermaid() {
  if (!mermaidInit) {
    mermaidInit = import('mermaid').then((mod) => {
      const mermaid = mod.default
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'neutral',
        fontFamily: 'inherit',
      })
      return mermaid
    })
  }
  return mermaidInit
}

/**
 * Renders a Mermaid diagram from source text. Shared by bubble + main chat via markdown.
 */
export default function ChatMermaid({ source }: { source: string }) {
  const reactId = useId().replace(/:/g, '')
  const [state, setState] = useState<RenderState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    const diagram = source.trim()
    if (!diagram) {
      setState({ status: 'error', message: 'Empty diagram' })
      return
    }

    setState({ status: 'loading' })
    ;(async () => {
      try {
        const mermaid = await getMermaid()
        const id = `ai-mermaid-${reactId}-${Math.random().toString(36).slice(2, 8)}`
        const { svg } = await mermaid.render(id, diagram)
        if (!cancelled) setState({ status: 'ready', svg })
      } catch (err) {
        if (!cancelled) {
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : 'Could not render diagram',
          })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [source, reactId])

  if (state.status === 'loading') {
    return <div className="ai-chat-mermaid ai-chat-mermaid--loading">Rendering diagram…</div>
  }

  if (state.status === 'error') {
    return (
      <div className="ai-chat-mermaid ai-chat-mermaid--error">
        <div className="ai-chat-mermaid__fallback-label">Mermaid (could not render)</div>
        <pre className="ai-chat-mermaid__fallback">
          <code>{source}</code>
        </pre>
      </div>
    )
  }

  return (
    <div
      className="ai-chat-mermaid"
      role="img"
      aria-label="Diagram"
      dangerouslySetInnerHTML={{ __html: state.svg }}
    />
  )
}
