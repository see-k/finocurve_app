/**
 * A2A Service
 * Frontend service layer for A2A (Agent2Agent) server management
 */

import type {
    A2AStartOptions,
    A2AStartResult,
    A2AStopResult,
    A2AServerStatus,
    A2ASettings,
} from '../types/A2A'

// ============================================
// API Availability Check
// ============================================

/**
 * Check if A2A API is available (running in Electron)
 */
export const hasA2AAPI = (): boolean => {
    return typeof window !== 'undefined' && !!(window as any).a2aAPI
}

// ============================================
// A2A Server Control Functions
// ============================================

/**
 * Start the A2A server
 */
export async function startA2AServer(options?: A2AStartOptions): Promise<A2AStartResult> {
    if (!hasA2AAPI()) {
        return { success: false, error: 'A2A API not available - not running in Electron' }
    }

    try {
        const result = await (window as any).a2aAPI.start(options)
        return result
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to start A2A server',
        }
    }
}

/**
 * Stop the A2A server
 */
export async function stopA2AServer(): Promise<A2AStopResult> {
    if (!hasA2AAPI()) {
        return { success: false, error: 'A2A API not available - not running in Electron' }
    }

    try {
        const result = await (window as any).a2aAPI.stop()
        return result
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to stop A2A server',
        }
    }
}

/**
 * Get the current A2A server status
 */
export async function getA2AServerStatus(): Promise<A2AServerStatus | null> {
    if (!hasA2AAPI()) return null

    try {
        const response = await (window as any).a2aAPI.getStatus()
        if (!response.success) {
            throw new Error(response.error || 'Failed to get A2A server status')
        }
        return response.data || null
    } catch (error) {
        throw error
    }
}

/**
 * Get A2A server settings
 */
export async function getA2ASettings(): Promise<A2ASettings | null> {
    if (!hasA2AAPI()) return null

    try {
        const response = await (window as any).a2aAPI.getSettings()
        if (!response.success) {
            throw new Error(response.error || 'Failed to get A2A settings')
        }
        return response.data || null
    } catch (error) {
        throw error
    }
}

/**
 * Update A2A server settings
 */
export async function updateA2ASettings(settings: Partial<A2ASettings>): Promise<boolean> {
    if (!hasA2AAPI()) {
        throw new Error('A2A API not available - not running in Electron')
    }

    try {
        const response = await (window as any).a2aAPI.updateSettings(settings)
        if (!response.success) {
            throw new Error(response.error || 'Failed to update A2A settings')
        }
        return true
    } catch (error) {
        throw error
    }
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Check if the A2A server is currently running
 */
export async function isA2AServerRunning(): Promise<boolean> {
    try {
        const status = await getA2AServerStatus()
        return status?.running ?? false
    } catch {
        return false
    }
}

/**
 * Subscribe to A2A verbose log events (request, LLM start/end, response)
 * @param callback - Function to call when a verbose event occurs
 * @returns Unsubscribe function
 */
export function subscribeToVerbose(callback: (event: import('../types/A2A').A2AVerboseEvent) => void): () => void {
    if (!hasA2AAPI() || !(window as any).a2aAPI?.onVerbose) {
        return () => {}
    }
    return (window as any).a2aAPI.onVerbose(callback)
}

/**
 * Toggle the A2A server (start if stopped, stop if running)
 */
export async function toggleA2AServer(): Promise<A2AStartResult | A2AStopResult> {
    const running = await isA2AServerRunning()
    if (running) {
        return stopA2AServer()
    } else {
        return startA2AServer()
    }
}
