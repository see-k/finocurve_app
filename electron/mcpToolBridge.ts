/**
 * Bridge between MCP tools and LangChain StructuredTools.
 * Converts MCP tool definitions into LangChain tools so the AI model can discover and invoke them.
 */

import { z } from 'zod'
import { tool, type StructuredToolInterface } from '@langchain/core/tools'
import { getAllMCPTools, callMCPTool, type MCPToolInfo } from './mcpServer'
import { buildZodObjectFromJsonSchema } from './mcpSchemaBridge'

/**
 * Convert a single MCP tool definition into a LangChain StructuredTool.
 */
function mcpToolToLangChain(mcpTool: MCPToolInfo): StructuredToolInterface {
  const inputSchema = mcpTool.inputSchema
  const properties = (inputSchema.properties ?? {}) as Record<string, Record<string, unknown>>
  const required = (inputSchema.required ?? []) as string[]

  const zodSchema = Object.keys(properties).length > 0
    ? buildZodObjectFromJsonSchema(properties, required)
    : z.object({})

  return tool(
    // Accept (args, config) so callers can pass an AbortSignal via
    // RunnableConfig.signal. callMCPTool itself currently ignores it (the MCP
    // SDK doesn't expose cancellation), but the chat loop also races the
    // returned promise against the signal so a Stop press unblocks the UI
    // even when the underlying tool keeps running.
    async (args: Record<string, unknown>, _config?: { signal?: AbortSignal }) => {
      return await callMCPTool(mcpTool.name, args)
    },
    {
      name: mcpTool.name,
      description: mcpTool.description ?? `MCP tool from ${mcpTool.serverName}`,
      schema: zodSchema,
    }
  )
}

/**
 * Get all MCP tools as LangChain StructuredTools ready for model.bindTools().
 * Returns an empty array if no MCP servers are connected.
 */
export function getMCPLangChainTools(): StructuredToolInterface[] {
  const mcpTools = getAllMCPTools()
  return mcpTools.map(mcpToolToLangChain)
}
