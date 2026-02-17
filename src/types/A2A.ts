/**
 * A2A (Agent2Agent) Protocol Types
 * Types for A2A server management and status
 */

/** A2A server settings */
export interface A2ASettings {
    port: number
    autoStart: boolean
}

/** A2A server status */
export interface A2AServerStatus {
    running: boolean
    port: number
    url: string | null
    wellKnownUrl: string | null
}

/** A2A server start options */
export interface A2AStartOptions {
    port?: number
}

/** A2A server start result */
export interface A2AStartResult {
    success: boolean
    port?: number
    url?: string
    wellKnownUrl?: string
    error?: string
}

/** A2A server stop result */
export interface A2AStopResult {
    success: boolean
    error?: string
}

/** A2A status response from IPC */
export interface A2AStatusResponse {
    success: boolean
    data?: A2AServerStatus
    error?: string
}

/** A2A settings response from IPC */
export interface A2ASettingsResponse {
    success: boolean
    data?: A2ASettings
    error?: string
}

/** A2A settings update response from IPC */
export interface A2AUpdateSettingsResponse {
    success: boolean
    error?: string
}
