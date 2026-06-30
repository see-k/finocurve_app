import { describe, expect, it } from 'vitest'
import { ChatAbortRegistry } from './chatAbortRegistry'

describe('ChatAbortRegistry', () => {
  it('prepare registers a fresh controller per sender', () => {
    const registry = new ChatAbortRegistry()
    const first = registry.prepare(42)
    const second = registry.prepare(42)

    expect(first).not.toBe(second)
    expect(first.signal.aborted).toBe(true)
    expect(second.signal.aborted).toBe(false)
  })

  it('cancel aborts and removes the active controller', () => {
    const registry = new ChatAbortRegistry()
    const controller = registry.prepare(7)

    expect(registry.cancel(7)).toBe(true)
    expect(controller.signal.aborted).toBe(true)
    expect(registry.cancel(7)).toBe(false)
  })

  it('release only clears the controller when it is still active', () => {
    const registry = new ChatAbortRegistry()
    const first = registry.prepare(99)
    registry.release(99, first)
    expect(registry.cancel(99)).toBe(false)

    const active = registry.prepare(99)
    const replaced = registry.prepare(99)
    registry.release(99, active)
    expect(replaced.signal.aborted).toBe(false)
    expect(registry.cancel(99)).toBe(true)
  })

  it('isolates controllers by sender id', () => {
    const registry = new ChatAbortRegistry()
    const a = registry.prepare(1)
    const b = registry.prepare(2)

    expect(registry.cancel(1)).toBe(true)
    expect(a.signal.aborted).toBe(true)
    expect(b.signal.aborted).toBe(false)
  })
})
