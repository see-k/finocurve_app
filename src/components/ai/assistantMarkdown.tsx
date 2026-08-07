import type { Components } from 'react-markdown'
import type { ReactNode } from 'react'
import { Children, isValidElement } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { parseChartSpecJson } from '../../ai/chartSpec'
import ChatChart from './ChatChart'
import ChatMermaid from './ChatMermaid'

function codeText(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => (typeof child === 'string' || typeof child === 'number' ? String(child) : ''))
    .join('')
    .replace(/\n$/, '')
}

function languageFromClassName(className?: string): string | undefined {
  const match = /language-([\w-]+)/.exec(className || '')
  return match?.[1]?.toLowerCase()
}

function isVisualCodeElement(node: ReactNode): boolean {
  if (!isValidElement<{ className?: string }>(node)) return false
  const lang = languageFromClassName(node.props.className)
  return lang === 'mermaid' || lang === 'chart'
}

/**
 * Shared ReactMarkdown setup for assistant replies (bubble + main chats).
 * Renders ```mermaid and ```chart fences as interactive visuals; other code stays monospace.
 */
export const assistantMarkdownComponents: Components = {
  pre({ children }) {
    const only = Children.count(children) === 1 ? Children.toArray(children)[0] : null
    if (isVisualCodeElement(only)) {
      return <>{only}</>
    }
    return <pre>{children}</pre>
  },
  code({ className, children, ...rest }) {
    const lang = languageFromClassName(className)
    const text = codeText(children)

    if (lang === 'mermaid') {
      return <ChatMermaid source={text} />
    }

    if (lang === 'chart') {
      const spec = parseChartSpecJson(text)
      if (spec) return <ChatChart spec={spec} />
      // Incomplete streams often lack a closing brace; keep them as plain code until valid.
      const looksComplete = text.trim().endsWith('}')
      if (!looksComplete) {
        return (
          <code className={className} {...rest}>
            {children}
          </code>
        )
      }
      return (
        <div className="ai-chat-chart ai-chat-chart--error">
          <div className="ai-chat-chart__fallback-label">Chart (invalid JSON)</div>
          <pre>
            <code className={className} {...rest}>
              {children}
            </code>
          </pre>
        </div>
      )
    }

    return (
      <code className={className} {...rest}>
        {children}
      </code>
    )
  },
}

export function AssistantMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={assistantMarkdownComponents}>
      {content}
    </ReactMarkdown>
  )
}
