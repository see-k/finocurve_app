import { describe, expect, it } from 'vitest'
import {
  buildSlackPrompt,
  buildSlackThreadUrl,
  isSlackPermalink,
  isSlackStatusMessage,
  parseSlackBotConfig,
  renderSlackEmojis,
  slackMessageStillRunning,
  slackMessageText,
  streamSlackBotChat,
  testSlackBotConnection,
} from '../src/ai/slackBotChat'
import type { ChatMessage } from '../src/ai/types'

/** Shape Slack actually returns for an agent's thinking-step reply. */
const thinkingStepsMessage = {
  ts: '111.001',
  user: 'U0C1KK1S53L',
  text: ':books: Reading skill finocurve-api-access\n:gear: tool_search...\n:computer: terminal',
  blocks: [{
    type: 'rich_text',
    elements: [
      {
        type: 'rich_text_section',
        elements: [
          { type: 'emoji', name: 'books', unicode: '1f4da' },
          { type: 'text', text: ' Reading skill finocurve-api-access\n' },
          { type: 'emoji', name: 'gear', unicode: '2699-fe0f' },
          { type: 'text', text: ' tool_search...\n' },
          { type: 'emoji', name: 'book', unicode: '1f4d6' },
          { type: 'text', text: ' Reading create_comprehensive_report.py L1-45\n' },
          { type: 'emoji', name: 'computer', unicode: '1f4bb' },
          { type: 'text', text: ' terminal' },
        ],
      },
      { type: 'rich_text_preformatted', elements: [{ type: 'text', text: "python - <<'PY' ...\n" }] },
    ],
  }],
}

/** …and for the answer it posts afterwards, as a separate reply. */
const answerMessage = {
  ts: '111.002',
  user: 'U0C1KK1S53L',
  text: 'It ends in:\n\n`/api/alpaca/v2/account`',
  blocks: [{
    type: 'rich_text',
    elements: [{
      type: 'rich_text_section',
      elements: [
        { type: 'text', text: 'It ends in:\n\n' },
        { type: 'text', text: '/api/alpaca/v2/account', style: { code: true } },
        { type: 'text', text: '\nThat was the read-only Alpaca balance endpoint.' },
      ],
    }],
  }],
}

const messages: ChatMessage[] = [
  { role: 'user', content: 'What is our cash position?' },
  { role: 'assistant', content: '[Maeva]: Liquidity looks tight this quarter.' },
  { role: 'user', content: '@Athena please challenge that.' },
]

describe('slack bot expert wrapper', () => {
  it('builds a mentioned prompt with FinoCurve group context', () => {
    const prompt = buildSlackPrompt({
      botUserId: 'U0C1KK1S53L',
      expertName: 'Athena',
      messages,
      groupChat: {
        participantNames: ['Maeva', 'Athena'],
        directlyAddressed: true,
      },
    })
    expect(prompt.startsWith('<@U0C1KK1S53L>')).toBe(true)
    expect(prompt).toContain('FinoCurve group chat with Maeva')
    expect(prompt).toContain('specifically addressed')
    expect(prompt).toContain('User: What is our cash position?')
    expect(prompt).toContain('[Maeva]: Liquidity looks tight this quarter.')
    expect(prompt).toContain('Latest message from the user:\n@Athena please challenge that.')
  })

  it('sends a 1:1 turn as a plain bot mention, like the Slack prototype', () => {
    expect(buildSlackPrompt({
      botUserId: 'U0C1KK1S53L',
      expertName: 'Athena',
      messages: [{ role: 'user', content: 'Hello Athena' }],
    })).toBe('<@U0C1KK1S53L> Hello Athena')
  })

  it('builds a Slack thread permalink from the workspace URL', () => {
    expect(buildSlackThreadUrl('https://neqtex.slack.com/', 'D0C1MABCD', '1789506756.371649')).toBe(
      'https://neqtex.slack.com/archives/D0C1MABCD/p1789506756371649?thread_ts=1789506756.371649&cid=D0C1MABCD',
    )
    expect(isSlackPermalink('https://neqtex.slack.com/archives/D0C1MABCD/p1789506756371649')).toBe(true)
    expect(isSlackPermalink('https://evil.example/slack.com')).toBe(false)
  })

  it('requires a user token and bot user id', () => {
    expect(parseSlackBotConfig({ slackUserToken: 'xoxp-1', slackBotUserId: 'U123' })).toEqual({
      userToken: 'xoxp-1',
      botUserId: 'U123',
    })
    expect(parseSlackBotConfig({ slackUserToken: 'xoxp-1' })).toBeNull()
    expect(parseSlackBotConfig({})).toBeNull()
  })

  it('rejects bot tokens when testing the connection', async () => {
    const result = await testSlackBotConnection({
      userToken: 'xoxb-bot',
      botUserId: 'U123',
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/xoxp-/)
  })

  it('opens a DM and streams threaded bot edits as answer chunks', async () => {
    const calls: string[] = []
    let polls = 0
    const request = async (method: string, body: Record<string, unknown> = {}) => {
      calls.push(method)
      if (method === 'auth.test') return { ok: true, user_id: 'UUSER' }
      if (method === 'conversations.open') return { ok: true, channel: { id: 'DCHANNEL' } }
      if (method === 'chat.postMessage') return { ok: true, ts: '111.000' }
      if (method === 'conversations.replies') {
        expect(body).not.toHaveProperty('inclusive')
        expect(body.ts).toBe('111.000')
        expect(body.limit).toBe(15)
        polls += 1
        if (polls === 1) {
          return {
            ok: true,
            messages: [
              { ts: '111.000', user: 'UUSER', text: '<@U0C1KK1S53L> hello' },
              { ts: '111.001', user: 'U0C1KK1S53L', text: 'Hello' },
            ],
          }
        }
        return {
          ok: true,
          messages: [
            { ts: '111.000', user: 'UUSER', text: '<@U0C1KK1S53L> hello' },
            { ts: '111.001', user: 'U0C1KK1S53L', text: 'Hello from Athena' },
          ],
        }
      }
      throw new Error(`unexpected ${method}`)
    }

    let now = 0
    const chunks: string[] = []
    for await (const chunk of streamSlackBotChat({
      config: { userToken: 'xoxp-user', botUserId: 'U0C1KK1S53L' },
      expertName: 'Athena',
      messages: [{ role: 'user', content: 'hello' }],
      request,
      now: () => now,
      sleep: async () => { now += 3_000 },
      pollMs: 1,
      idleCompleteMs: 3_000,
      timeoutMs: 10_000,
    })) {
      if (chunk.type === 'answer') chunks.push(chunk.content)
    }

    expect(calls).toContain('conversations.open')
    expect(calls).toContain('chat.postMessage')
    expect(chunks.join('')).toBe('Hello from Athena')
    expect(slackMessageText({ markdown_text: 'md', text: 'plain' })).toBe('md')
  })

  it('emits a Slack permalink so the chat can open the live thread', async () => {
    const request = async (method: string) => {
      if (method === 'auth.test') return { ok: true, user_id: 'UUSER', url: 'https://neqtex.slack.com/' }
      if (method === 'conversations.open') return { ok: true, channel: { id: 'DCHANNEL' } }
      if (method === 'chat.postMessage') return { ok: true, ts: '111.000' }
      if (method === 'chat.getPermalink') {
        return { ok: true, permalink: 'https://neqtex.slack.com/archives/DCHANNEL/p111000' }
      }
      if (method === 'conversations.replies') {
        return {
          ok: true,
          messages: [
            { ts: '111.000', user: 'UUSER', text: '<@U0C1KK1S53L> hello' },
            { ts: '111.001', user: 'U0C1KK1S53L', text: 'Hello from Athena' },
          ],
        }
      }
      throw new Error(`unexpected ${method}`)
    }

    let now = 0
    const sources: string[] = []
    for await (const chunk of streamSlackBotChat({
      config: { userToken: 'xoxp-user', botUserId: 'U0C1KK1S53L' },
      expertName: 'Athena',
      messages: [{ role: 'user', content: 'hello' }],
      request,
      now: () => now,
      sleep: async () => { now += 3_000 },
      pollMs: 1,
      idleCompleteMs: 3_000,
      timeoutMs: 10_000,
    })) {
      if (chunk.type === 'source') sources.push(chunk.url)
    }

    expect(sources).toEqual(['https://neqtex.slack.com/archives/DCHANNEL/p111000'])
  })

  it('turns Slack emoji shortcodes into unicode icons', () => {
    expect(renderSlackEmojis('Hello Chike :wave: How can I help you today?')).toBe(
      'Hello Chike 👋 How can I help you today?',
    )
    expect(slackMessageText({ text: ':+1: looks good' })).toBe('👍 looks good')
    expect(renderSlackEmojis('keep :custom_workspace_emoji:')).toBe('keep :custom_workspace_emoji:')
  })

  it('renders rich_text replies with real emoji, line breaks, and code', () => {
    expect(slackMessageText(thinkingStepsMessage)).toBe([
      '📚 Reading skill finocurve-api-access  ',
      '⚙️ tool_search...  ',
      '📖 Reading create_comprehensive_report.py L1-45  ',
      '💻 terminal',
      '```',
      "python - <<'PY' ...",
      '```',
    ].join('\n'))

    expect(slackMessageText(answerMessage)).toBe([
      'It ends in:',
      '',
      '`/api/alpaca/v2/account`  ',
      'That was the read-only Alpaca balance endpoint.',
    ].join('\n'))
  })

  it('unescapes Slack entities instead of leaking &lt;', () => {
    expect(slackMessageText({ text: 'use `Bearer &lt;key&gt;` &amp; retry' })).toBe('use `Bearer <key>` & retry')
  })

  it('classifies emoji-led thinking steps as status, not a finished reply', () => {
    expect(isSlackStatusMessage(thinkingStepsMessage)).toBe(true)
    expect(isSlackStatusMessage(answerMessage)).toBe(false)

    // A step type we have never seen before is still emoji-led, so it still counts as status.
    expect(isSlackStatusMessage({
      blocks: [{
        type: 'rich_text',
        elements: [{
          type: 'rich_text_section',
          elements: [
            { type: 'emoji', name: 'rocket', unicode: '1f680' },
            { type: 'text', text: ' Deploying the brand new thing nobody has taught us about yet' },
          ],
        }],
      }],
    })).toBe(true)

    expect(slackMessageStillRunning({
      text: 'Reading skill finocurve-api-access',
      chunks: [{ type: 'task_update', title: 'Reading skill', status: 'in_progress' }],
    })).toBe(true)
    expect(slackMessageStillRunning({ text: 'Your Alpaca account is connected.' })).toBe(false)
  })

  it('waits through the thinking-step reply for the answer posted as a separate reply', async () => {
    let polls = 0
    const request = async (method: string) => {
      if (method === 'auth.test') return { ok: true, user_id: 'UUSER' }
      if (method === 'conversations.open') return { ok: true, channel: { id: 'DCHANNEL' } }
      if (method === 'chat.postMessage') return { ok: true, ts: '111.000' }
      if (method === 'conversations.replies') {
        polls += 1
        const parent = { ts: '111.000', user: 'UUSER', text: '<@U0C1KK1S53L> endpoint' }
        return {
          ok: true,
          messages: polls <= 3
            ? [parent, thinkingStepsMessage]
            : [parent, thinkingStepsMessage, answerMessage],
        }
      }
      throw new Error(`unexpected ${method}`)
    }

    let now = 0
    const chunks: string[] = []
    for await (const chunk of streamSlackBotChat({
      config: { userToken: 'xoxp-user', botUserId: 'U0C1KK1S53L' },
      expertName: 'Athena',
      messages: [{ role: 'user', content: 'endpoint' }],
      request,
      now: () => now,
      sleep: async () => { now += 3_000 },
      pollMs: 1,
      idleCompleteMs: 3_000,
      timeoutMs: 300_000,
    })) {
      if (chunk.type === 'answer') chunks.push(chunk.content)
    }

    expect(polls).toBeGreaterThan(3)
    const rendered = chunks.join('')
    expect(rendered).toContain('📚 Reading skill finocurve-api-access')
    expect(rendered).toContain('💻 terminal')
    expect(rendered).toContain('That was the read-only Alpaca balance endpoint.')
    // Thinking steps stay on their own lines, and the answer is its own paragraph.
    expect(rendered).toMatch(/Reading skill finocurve-api-access {2}\n/)
    expect(rendered).toContain('\n\nIt ends in:')
  })

  it('keeps streaming after a skill-read pause until the real answer is idle', async () => {
    let polls = 0
    const request = async (method: string) => {
      if (method === 'auth.test') return { ok: true, user_id: 'UUSER' }
      if (method === 'conversations.open') return { ok: true, channel: { id: 'DCHANNEL' } }
      if (method === 'chat.postMessage') return { ok: true, ts: '111.000' }
      if (method === 'conversations.replies') {
        polls += 1
        const parent = { ts: '111.000', user: 'UUSER', text: '<@U0C1KK1S53L> alpaca' }
        if (polls <= 3) {
          return {
            ok: true,
            messages: [
              parent,
              { ts: '111.001', user: 'U0C1KK1S53L', text: 'Reading skill finocurve-api-access' },
            ],
          }
        }
        return {
          ok: true,
          messages: [
            parent,
            { ts: '111.001', user: 'U0C1KK1S53L', text: 'Reading skill finocurve-api-access' },
            { ts: '111.002', user: 'U0C1KK1S53L', text: 'Your Alpaca account is connected.' },
          ],
        }
      }
      throw new Error(`unexpected ${method}`)
    }

    let now = 0
    const chunks: string[] = []
    for await (const chunk of streamSlackBotChat({
      config: { userToken: 'xoxp-user', botUserId: 'U0C1KK1S53L' },
      expertName: 'Athena',
      messages: [{ role: 'user', content: 'alpaca' }],
      request,
      now: () => now,
      sleep: async () => { now += 3_000 },
      pollMs: 1,
      idleCompleteMs: 3_000,
      timeoutMs: 30_000,
    })) {
      if (chunk.type === 'answer') chunks.push(chunk.content)
    }

    expect(polls).toBeGreaterThan(3)
    expect(chunks.join('')).toBe('Reading skill finocurve-api-access\n\nYour Alpaca account is connected.')
  })

  it('verifies a saved DM channel without requiring im:write to test', async () => {
    const calls: string[] = []
    const result = await testSlackBotConnection(
      { userToken: 'xoxp-user', botUserId: 'U0C1KK1S53L', dmChannel: 'DSAVED' },
      async (method) => {
        calls.push(method)
        if (method === 'auth.test') return { ok: true, user_id: 'UUSER' }
        if (method === 'conversations.info') {
          return { ok: true, channel: { id: 'DSAVED', is_im: true, user: 'U0C1KK1S53L' } }
        }
        throw new Error('missing_scope')
      },
    )
    expect(result).toEqual({ ok: true, dmChannel: 'DSAVED' })
    expect(calls).not.toContain('conversations.open')
  })

  it('re-opens the DM when the saved channel belongs to a different bot', async () => {
    const calls: string[] = []
    const result = await testSlackBotConnection(
      { userToken: 'xoxp-user', botUserId: 'UNEWBOT', dmChannel: 'DOLDBOT' },
      async (method) => {
        calls.push(method)
        if (method === 'auth.test') return { ok: true, user_id: 'UUSER' }
        if (method === 'conversations.info') {
          return { ok: true, channel: { id: 'DOLDBOT', is_im: true, user: 'UPREVIOUSBOT' } }
        }
        if (method === 'conversations.open') return { ok: true, channel: { id: 'DFRESH' } }
        throw new Error(`unexpected ${method}`)
      },
    )
    expect(result).toEqual({ ok: true, dmChannel: 'DFRESH' })
    expect(calls).toContain('conversations.open')
  })

  it('ignores replies from other humans in the thread', async () => {
    let polls = 0
    const request = async (method: string) => {
      if (method === 'auth.test') return { ok: true, user_id: 'UUSER' }
      if (method === 'users.info') return { ok: true, user: { profile: { bot_id: 'B0BOT' } } }
      if (method === 'conversations.open') return { ok: true, channel: { id: 'DCHANNEL' } }
      if (method === 'chat.postMessage') return { ok: true, ts: '111.000' }
      if (method === 'conversations.replies') {
        polls += 1
        return {
          ok: true,
          messages: [
            { ts: '111.000', user: 'UUSER', text: '<@U0C1KK1S53L> hello' },
            { ts: '111.002', user: 'UCOLLEAGUE', text: 'Ignore that, ask me instead' },
            { ts: '111.005', bot_id: 'B0OTHERBOT', text: 'Standup reminder from another bot' },
            ...(polls > 1 ? [{ ts: '111.003', user: 'U0C1KK1S53L', text: 'Answer from the bot' }] : []),
          ],
        }
      }
      throw new Error(`unexpected ${method}`)
    }

    let now = 0
    const chunks: string[] = []
    for await (const chunk of streamSlackBotChat({
      config: { userToken: 'xoxp-user', botUserId: 'U0C1KK1S53L' },
      expertName: 'Athena',
      messages: [{ role: 'user', content: 'hello' }],
      request,
      now: () => now,
      sleep: async () => { now += 3_000 },
      pollMs: 1,
      idleCompleteMs: 3_000,
      timeoutMs: 10_000,
    })) {
      if (chunk.type === 'answer') chunks.push(chunk.content)
    }

    expect(chunks.join('')).toBe('Answer from the bot')
    expect(chunks.join('')).not.toContain('ask me instead')
  })

  it('treats a code-only reply as the answer rather than a progress step', () => {
    const codeOnly = {
      ts: '111.004',
      user: 'U0C1KK1S53L',
      blocks: [{
        type: 'rich_text',
        elements: [{
          type: 'rich_text_preformatted',
          elements: [{ type: 'text', text: 'const rate = 0.05\nreturn principal * rate' }],
        }],
      }],
    }
    expect(isSlackStatusMessage(codeOnly)).toBe(false)
    expect(slackMessageStillRunning(codeOnly)).toBe(false)
  })

  it('ignores replies from other bots in the thread', async () => {
    let polls = 0
    const request = async (method: string) => {
      if (method === 'auth.test') return { ok: true, user_id: 'UUSER' }
      if (method === 'users.info') return { ok: true, user: { profile: { bot_id: 'B0OURBOT' } } }
      if (method === 'conversations.open') return { ok: true, channel: { id: 'DCHANNEL' } }
      if (method === 'chat.postMessage') return { ok: true, ts: '111.000' }
      if (method === 'conversations.replies') {
        polls += 1
        return {
          ok: true,
          messages: [
            { ts: '111.000', user: 'UUSER', text: '<@U0C1KK1S53L> hello' },
            { ts: '111.001', bot_id: 'B0STRANGER', text: 'Unrelated bot chatter' },
            ...(polls > 1 ? [{ ts: '111.002', bot_id: 'B0OURBOT', text: 'The real answer' }] : []),
          ],
        }
      }
      throw new Error(`unexpected ${method}`)
    }

    let now = 0
    const chunks: string[] = []
    for await (const chunk of streamSlackBotChat({
      config: { userToken: 'xoxp-user', botUserId: 'U0C1KK1S53L' },
      expertName: 'Athena',
      messages: [{ role: 'user', content: 'hello' }],
      request,
      now: () => now,
      sleep: async () => { now += 3_000 },
      pollMs: 1,
      idleCompleteMs: 3_000,
      timeoutMs: 10_000,
    })) {
      if (chunk.type === 'answer') chunks.push(chunk.content)
    }

    expect(chunks.join('')).toBe('The real answer')
    expect(chunks.join('')).not.toContain('Unrelated bot chatter')
  })

  it('waits out a long tool pause instead of settling for a progress-only reply', async () => {
    let polls = 0
    const request = async (method: string) => {
      if (method === 'auth.test') return { ok: true, user_id: 'UUSER' }
      if (method === 'conversations.open') return { ok: true, channel: { id: 'DCHANNEL' } }
      if (method === 'chat.postMessage') return { ok: true, ts: '111.000' }
      if (method === 'conversations.replies') {
        polls += 1
        const parent = { ts: '111.000', user: 'UUSER', text: '<@U0C1KK1S53L> alpaca' }
        const progress = { ts: '111.001', user: 'U0C1KK1S53L', text: 'Reading skill finocurve-api-access' }
        // The tool call stalls well past idleCompleteMs * 6 before answering.
        if (polls < 12) return { ok: true, messages: [parent, progress] }
        return {
          ok: true,
          messages: [parent, progress, { ts: '111.002', user: 'U0C1KK1S53L', text: 'Alpaca is a broker API.' }],
        }
      }
      throw new Error(`unexpected ${method}`)
    }

    let now = 0
    const chunks: string[] = []
    for await (const chunk of streamSlackBotChat({
      config: { userToken: 'xoxp-user', botUserId: 'U0C1KK1S53L' },
      expertName: 'Athena',
      messages: [{ role: 'user', content: 'alpaca' }],
      request,
      now: () => now,
      sleep: async () => { now += 5_000 },
      pollMs: 1,
      idleCompleteMs: 3_000,
      timeoutMs: 300_000,
    })) {
      if (chunk.type === 'answer') chunks.push(chunk.content)
    }

    expect(chunks.join('')).toContain('Alpaca is a broker API.')
  })

  it('tells the Slack bot about attachments it cannot see', () => {
    const prompt = buildSlackPrompt({
      botUserId: 'U0C1KK1S53L',
      expertName: 'Athena',
      messages: [{
        role: 'user',
        content: 'What does this say?',
        attachments: [{ name: 'q3-report.pdf', mimeType: 'application/pdf', dataBase64: 'AAA' }],
      }],
    })
    expect(prompt).toContain('q3-report.pdf')
    expect(prompt).toContain('could not be forwarded to Slack')
  })
})
