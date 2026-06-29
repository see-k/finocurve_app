import { Buffer } from 'node:buffer'
import { HumanMessage } from '@langchain/core/messages'
import type { ChatMessage } from '../types'
import { extractTextFromDocument } from './documentParser'
import { isProbablyUtf8TextFile, isVisionImageMime } from './localAIChatParsing'

export const MAX_VISION_IMAGE_BYTES = 12 * 1024 * 1024
export const MAX_ATTACHMENT_TEXT_CHARS = 80_000

/** Build a LangChain user message with optional vision blocks and inlined document text. */
export async function chatUserToHumanMessage(message: ChatMessage): Promise<HumanMessage> {
  const attachments = message.attachments
  if (!attachments?.length) {
    return new HumanMessage(message.content)
  }

  const supplemental: string[] = []
  const imageBlocks: { type: 'image_url'; image_url: { url: string } }[] = []

  for (const att of attachments) {
    const name = att.name?.trim() || 'attachment'
    let buf: Uint8Array
    try {
      buf = new Uint8Array(Buffer.from(att.dataBase64, 'base64'))
    } catch {
      supplemental.push(`[Attached ${name}: invalid base64 encoding]`)
      continue
    }
    if (buf.length === 0) {
      supplemental.push(`[Attached ${name}: empty file]`)
      continue
    }

    const mime = (att.mimeType || 'application/octet-stream').toLowerCase().split(';')[0].trim()

    if (isVisionImageMime(mime)) {
      if (buf.length > MAX_VISION_IMAGE_BYTES) {
        supplemental.push(
          `[Image ${name} skipped: file exceeds ${MAX_VISION_IMAGE_BYTES / 1024 / 1024}MB limit]`
        )
        continue
      }
      const b64 = Buffer.from(buf).toString('base64')
      imageBlocks.push({
        type: 'image_url',
        image_url: { url: `data:${mime};base64,${b64}` },
      })
      continue
    }

    let extracted = ''
    try {
      extracted = (await extractTextFromDocument(buf, mime, name)).trim()
    } catch (e) {
      supplemental.push(
        `[Attached ${name}: text extraction failed — ${e instanceof Error ? e.message : 'unknown error'}]`
      )
      continue
    }

    if (!extracted && isProbablyUtf8TextFile(name, mime)) {
      extracted = new TextDecoder('utf-8', { fatal: false }).decode(buf).trim()
    }

    if (extracted) {
      const body =
        extracted.length > MAX_ATTACHMENT_TEXT_CHARS
          ? `${extracted.slice(0, MAX_ATTACHMENT_TEXT_CHARS)}\n… [truncated]`
          : extracted
      supplemental.push(`--- ${name} ---\n${body}`)
    } else {
      supplemental.push(
        `[Attached ${name}: no extractable text. Supported: images (PNG, JPEG, GIF, WebP), PDF, CSV, TXT, and common text/code formats.]`
      )
    }
  }

  const textBody = [message.content.trim(), supplemental.filter(Boolean).join('\n\n')]
    .filter(Boolean)
    .join('\n\n')
    .trim()
  const finalText = textBody || '(User attached files only.)'

  if (imageBlocks.length === 0) {
    return new HumanMessage(finalText)
  }

  return new HumanMessage({
    content: [{ type: 'text', text: finalText }, ...imageBlocks],
  })
}
