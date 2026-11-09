import { describe, expect, test } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSnapshot } from './domain/snapshot'
import { RepoSnapshotIndex, validateRepoSnapshots } from './domain/repoSnapshots'
import { catalog } from './catalog'

const dir = join(__dirname, '../../snapshots')
const names = readdirSync(dir).filter(name => name !== 'README.md')
const files = Object.fromEntries(names.map(name => [name, readFileSync(join(dir, name), 'utf8')]))
const index = RepoSnapshotIndex.parse(JSON.parse(files['index.json']))
const deck001 = index.snapshots.find(s => s.deck === 'Deck 001')!

describe('committed repository snapshots', () => {
  test('every snapshot validates against the real catalog and resolves in every pose', () => {
    expect(validateRepoSnapshots(files, catalog)).toEqual([])
  })

  test('the first Deck 001 snapshot is labelled illustrative and uncalibrated, never authoritative or as-built', () => {
    expect(deck001).toBeDefined()
    expect(deck001.file).toContain('illustrative')
    expect(deck001.status).toBe('illustrative')
    expect(deck001.calibration).toBe('uncalibrated')
    expect(deck001.authoritative).toBe(false)
    expect(deck001.asBuilt).toBe(false)
    expect(deck001.notes.length).toBeGreaterThan(0)
  })

  test('uses the confirmed Hosyond reference while later physical details stay unverified', () => {
    expect(deck001.unverifiedIdentities.map(u => u.ref)).toContain('hosyond-7in-touch@1')
    const parsed = parseSnapshot(files[deck001.file], catalog)
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'))
    expect(parsed.configuration.placements.map(p => `${p.component.id}@${p.component.revision}`)).toContain('hosyond-7in-touch@1')
    for (const u of deck001.unverifiedIdentities) expect(u.note.length).toBeGreaterThan(0)
  })

  test('the snapshot directory contains no unrelated JSON and is not under the catalog glob', () => {
    expect(names.filter(n => n !== 'index.json').every(n => n.endsWith('.json'))).toBe(true)
    expect(dir).not.toContain('/catalog')
  })
})
