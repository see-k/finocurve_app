/**
 * Pure JSON Schema → Zod conversion for MCP tool input schemas.
 */

import { z } from 'zod'

export function jsonSchemaPropertyToZod(prop: Record<string, unknown>): z.ZodTypeAny {
  const type = prop.type as string | undefined
  const desc = prop.description as string | undefined

  let schema: z.ZodTypeAny

  switch (type) {
    case 'string': {
      if (prop.enum && Array.isArray(prop.enum)) {
        const values = prop.enum as [string, ...string[]]
        schema = z.enum(values)
      } else {
        schema = z.string()
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
        schema = buildZodObjectFromJsonSchema(nested, (prop.required as string[]) ?? [])
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

export function buildZodObjectFromJsonSchema(
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
