import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { buildZodObjectFromJsonSchema, jsonSchemaPropertyToZod } from './mcpSchemaBridge'

describe('jsonSchemaPropertyToZod', () => {
  it('maps string enums to z.enum', () => {
    const schema = jsonSchemaPropertyToZod({ type: 'string', enum: ['a', 'b'] })
    expect(schema.parse('a')).toBe('a')
    expect(() => schema.parse('c')).toThrow()
  })

  it('maps number, integer, and boolean types', () => {
    expect(jsonSchemaPropertyToZod({ type: 'number' }).parse(1.5)).toBe(1.5)
    expect(jsonSchemaPropertyToZod({ type: 'integer' }).parse(2)).toBe(2)
    expect(jsonSchemaPropertyToZod({ type: 'boolean' }).parse(true)).toBe(true)
  })

  it('maps arrays with typed or unknown items', () => {
    const typed = jsonSchemaPropertyToZod({ type: 'array', items: { type: 'string' } })
    expect(typed.parse(['x'])).toEqual(['x'])
    expect(jsonSchemaPropertyToZod({ type: 'array' }).parse([1, 'a'])).toEqual([1, 'a'])
  })

  it('maps nested objects and unknown types', () => {
    const nested = jsonSchemaPropertyToZod({
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    })
    expect(nested.parse({ name: 'route' })).toEqual({ name: 'route' })
    expect(jsonSchemaPropertyToZod({ type: 'null' }).parse('anything')).toBe('anything')
  })
})

describe('buildZodObjectFromJsonSchema', () => {
  it('marks non-required fields optional', () => {
    const schema = buildZodObjectFromJsonSchema(
      {
        path: { type: 'string' },
        scaleFactor: { type: 'number' },
      },
      ['path']
    )
    expect(schema.parse({ path: '/main' })).toEqual({ path: '/main' })
    expect(schema.parse({ path: '/main', scaleFactor: 2 })).toEqual({ path: '/main', scaleFactor: 2 })
    expect(() => schema.parse({ scaleFactor: 2 })).toThrow()
  })

  it('returns an empty object schema when properties are empty', () => {
    const schema = buildZodObjectFromJsonSchema({}, [])
    expect(schema.parse({})).toEqual({})
  })

  it('accepts app_browser_navigate-like required path args', () => {
    const schema = buildZodObjectFromJsonSchema({ path: { type: 'string' } }, ['path'])
    expect(schema.parse({ path: '/main?tab=portfolio' })).toEqual({ path: '/main?tab=portfolio' })
    expect(() => schema.parse({})).toThrow()
  })

  it('preserves descriptions on fields', () => {
    const schema = buildZodObjectFromJsonSchema(
      { path: { type: 'string', description: 'Route path' } },
      ['path']
    )
    const shape = (schema as z.ZodObject<{ path: z.ZodString }>).shape
    expect(shape.path.description).toBe('Route path')
  })
})
