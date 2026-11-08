import { expect, test } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { estimateFeatures, ComponentDefinition } from './catalog'

const dir = join(__dirname, '../../../catalog/components')
type Raw = { id: string; envelope: { confidence: string }; activeArea?: { confidence: string }; [k: string]: unknown }

test('estimateFeatures lists exactly the catalog features recorded as estimate', () => {
  for (const file of readdirSync(dir)) {
    const raw = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Raw
    const expected: string[] = []
    if (raw.envelope.confidence === 'estimate') expected.push('envelope')
    if (raw.activeArea?.confidence === 'estimate') expected.push('active area')
    for (const [key, label] of [['mountingHoles', 'mounting hole'], ['ports', 'port'], ['keepOuts', 'keep-out']] as const) {
      for (const f of raw[key] as { id: string; confidence: string }[]) if (f.confidence === 'estimate') expected.push(`${label} ${f.id}`)
    }
    expect(estimateFeatures(ComponentDefinition.parse(raw)), file).toEqual(expected)
  }
})

test('datasheet features are not listed as estimate', () => {
  const pi = ComponentDefinition.parse(JSON.parse(readFileSync(join(dir, 'raspberry-pi-5.json'), 'utf8')))
  expect(pi.mountingHoles.every(h => h.confidence === 'datasheet')).toBe(true)
  expect(estimateFeatures(pi).some(f => f.startsWith('mounting hole'))).toBe(false)
  expect(estimateFeatures(pi)).toContain('envelope')
})
