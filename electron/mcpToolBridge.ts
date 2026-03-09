/**
 * Bridge between MCP tools and LangChain StructuredTools.
 * Converts MCP tool definitions into LangChain tools so the AI model can discover and invoke them.
 */

import { z } from 'zod'
import { tool, type StructuredToolInterface } from '@langchain/core/tools'
import { getAllMCPTools, callMCPTool, type MCPToolInfo } from './mcpServer'

/**
 * Convert a JSON Schema property to a Zod schema.
 * Handles the common types found in MCP tool input schemas.
 */
function jsonSchemaPropertyToZod(prop: Record<string, unknown>): z.ZodTypeAny {
  const type = prop.type as string | undefined
  const desc = prop.description as string | undefined

  let schema: z.ZodTypeAny

  switch (type) {
    case 'string': {
      let s = z.string()
      if (prop.enum && Array.isArray(prop.enum)) {
        const values = prop.enum as [string, ...string[]]
        schema = z.enum(values)
      } else {
        schema = s
      }
      break
    }
    case 'number':
    case 'integer':
      schema = z.number()
      break
    case 'boolean':
      schema = z.boolean()
      break
    case 'array': {
      const items = prop.items as Record<string, unknown> | undefined
      schema = items ? z.array(jsonSchemaPropertyToZod(items)) : z.array(z.unknown())
      break
    }
    case 'object': {
      const nested = prop.properties as Record<string, Record<string, unknown>> | undefined
      if (nested) {
        schema = buildZodObject(nested, (prop.required as string[]) ?? [])
      } else {
        schema = z.record(z.string(), z.unknown())
      }
      break
    }
    default:
      schema = z.unknown()
  }

  if (desc) {
    schema = schema.describe(desc)
  }

  return schema
}

/**
 * Build a zod object schema from JSON Schema properties.
 */
function buildZodObject(
  properties: Record<string, Record<string, unknown>>,
  required: string[]
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const [key, prop] of Object.entries(properties)) {
    let fieldSchema = jsonSchemaPropertyToZod(prop)
    if (!required.includes(key)) {
      fieldSchema = fieldSchema.optional()
    }
    shape[key] = fieldSchema
  }
  return z.object(shape)
}

/**
 * Convert a single MCP tool definition into a LangChain StructuredTool.
 */
function mcpToolToLangChain(mcpTool: MCPToolInfo): StructuredToolInterface {
  const inputSchema = mcpTool.inputSchema
  const properties = (inputSchema.properties ?? {}) as Record<string, Record<string, unknown>>
  const required = (inputSchema.required ?? []) as string[]

  const zodSchema = Object.keys(properties).length > 0
    ? buildZodObject(properties, required)
    : z.object({})

  return tool(
    async (args: Record<string, unknown>) => {
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
