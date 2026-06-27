import { describe, expect, it } from 'vitest'
import { formatRemoteToolLabel, nextRemoteIndicatorDepth } from './remoteIndicatorHelpers'

describe('formatRemoteToolLabel', () => {
  it('maps known browser tools to friendly labels', () => {
    expect(formatRemoteToolLabel('app_browser_screenshot')).toBe('Capturing viewport')
    expect(formatRemoteToolLabel('app_browser_navigate')).toBe('Navigating')
    expect(formatRemoteToolLabel('app_browser_scroll')).toBe('Scrolling')
    expect(formatRemoteToolLabel('app_browser_page_text')).toBe('Reading page')
  })

  it('strips the app_browser_ prefix for unknown tools', () => {
    expect(formatRemoteToolLabel('app_browser_list_routes')).toBe('list_routes')
  })

  it('falls back to Processing when tool name is missing', () => {
    expect(formatRemoteToolLabel(undefined)).toBe('Processing')
  })
})

describe('nextRemoteIndicatorDepth', () => {
  it('increments depth on start and keeps HUD active', () => {
    expect(nextRemoteIndicatorDepth(0, 'start')).toEqual({
      depth: 1,
      active: true,
      clearToolName: false,
    })
  })

  it('decrements depth on end and clears tool name when nesting reaches zero', () => {
    expect(nextRemoteIndicatorDepth(2, 'end')).toEqual({
      depth: 1,
      active: true,
      clearToolName: false,
    })
    expect(nextRemoteIndicatorDepth(1, 'end')).toEqual({
      depth: 0,
      active: false,
      clearToolName: true,
    })
  })

  it('never goes below zero depth', () => {
    expect(nextRemoteIndicatorDepth(0, 'end')).toEqual({
      depth: 0,
      active: false,
      clearToolName: true,
    })
  })
})
