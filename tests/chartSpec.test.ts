import { describe, expect, it } from 'vitest'
import { normalizeChartSpec, parseChartSpecJson } from '../src/ai/chartSpec'

describe('chartSpec', () => {
  it('accepts a valid bar chart', () => {
    expect(
      normalizeChartSpec({
        type: 'bar',
        title: 'Allocation',
        labels: ['Cash', 'Equity'],
        values: [20, 80],
      }),
    ).toEqual({
      type: 'bar',
      title: 'Allocation',
      labels: ['Cash', 'Equity'],
      values: [20, 80],
    })
  })

  it('rejects mismatched label/value lengths', () => {
    expect(
      normalizeChartSpec({
        type: 'line',
        labels: ['A', 'B'],
        values: [1],
      }),
    ).toBeNull()
  })

  it('parses fenced JSON and recovers from trailing commentary', () => {
    expect(
      parseChartSpecJson('{"type":"pie","labels":["A","B"],"values":[1,2]}\nnote'),
    ).toEqual({
      type: 'pie',
      labels: ['A', 'B'],
      values: [1, 2],
    })
  })

  it('rejects unknown chart types', () => {
    expect(parseChartSpecJson('{"type":"area","labels":["A"],"values":[1]}')).toBeNull()
  })
})
