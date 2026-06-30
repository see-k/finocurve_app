/**
 * Per-renderer-window AbortController registry for AI chat streaming.
 * Ensures a new chat request cancels any in-flight stream for the same sender,
 * and ai-chat-cancel can abort the active controller.
 */
export class ChatAbortRegistry {
  private readonly controllers = new Map<number, AbortController>()

  /** Abort any prior stream for senderId and register a fresh controller. */
  prepare(senderId: number): AbortController {
    this.controllers.get(senderId)?.abort()
    const controller = new AbortController()
    this.controllers.set(senderId, controller)
    return controller
  }

  /** Abort the active stream for senderId, if any. Returns true when a stream was cancelled. */
  cancel(senderId: number): boolean {
    const controller = this.controllers.get(senderId)
    if (!controller) return false
    controller.abort()
    this.controllers.delete(senderId)
    return true
  }

  /** Remove controller only when it is still the active one for senderId. */
  release(senderId: number, controller: AbortController): void {
    if (this.controllers.get(senderId) === controller) {
      this.controllers.delete(senderId)
    }
  }
}
