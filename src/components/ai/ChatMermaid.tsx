import { useEffect, useId, useState } from 'react'
import DOMPurify from 'dompurify'

type RenderState =
  | { status: 'loading' }
  | { status: 'ready'; svg: string }
  | { status: 'error'; message: string }

let mermaidModule: Promise<typeof import('mermaid').default> | null = null
let appliedTheme: string | null = null

function currentMermaidTheme(): 'dark' | 'neutral' {
  const appTheme = document.documentElement.getAttribute('data-theme') ?? ''
  return appTheme.startsWith('light') ? 'neutral' : 'dark'
}

async function getMermaid() {
  if (!mermaidModule) mermaidModule = import('mermaid').then((mod) => mod.default)
  const mermaid = await mermaidModule
  // Re-initialise only when the app theme changed since the last render.
  const theme = currentMermaidTheme()
  if (theme !== appliedTheme) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme,
      fontFamily: 'inherit',
      // Labels must be SVG <text>, not HTML inside <foreignObject>: the SVG-only
      // sanitizer below strips foreignObject, which left every node blank.
      htmlLabels: false,
      flowchart: { htmlLabels: false },
    })
    appliedTheme = theme
  }
  return mermaid
}

/** Sanitize Mermaid SVG before DOM injection; library strict mode alone is not enough. */
function sanitizeMermaidSvg(svg: string): string {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
  })
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
        const cleanSvg = sanitizeMermaidSvg(svg)
        if (!cleanSvg.trim()) {
          throw new Error('Diagram produced empty sanitized SVG')
        }
        if (!cancelled) setState({ status: 'ready', svg: cleanSvg })
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
