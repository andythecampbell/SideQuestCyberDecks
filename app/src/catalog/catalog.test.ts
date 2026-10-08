import { describe, expect, it } from 'vitest'
import { catalog, catalogFiles, parseCatalog } from './index'
import { Configuration } from '../domain/configuration'
import { refKey } from '../domain/catalog'
import { deck001 } from '../fixtures'

describe('catalog', () => {
  it('validates every catalog file', () => {
    expect(() => parseCatalog(catalogFiles)).not.toThrow()
    expect(catalog.components.size).toBeGreaterThan(0)
  })

  it('reports schema errors with the file path', () => {
    expect(() => parseCatalog({ 'bad.json': { kind: 'component', id: 'Bad Id' } })).toThrow(/bad\.json/)
  })
})

describe('deck 001 fixture', () => {
  it('is a valid configuration', () => {
    expect(Configuration.safeParse(deck001).success).toBe(true)
  })

  it('only references catalog entries that exist', () => {
    expect(catalog.enclosures.has(refKey(deck001.enclosure))).toBe(true)
    for (const p of deck001.placements) expect(catalog.components.has(refKey(p.component)), p.id).toBe(true)
  })

  it('round-trips through JSON', () => {
    expect(Configuration.parse(JSON.parse(JSON.stringify(deck001)))).toEqual(deck001)
  })
})
