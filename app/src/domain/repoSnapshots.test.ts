import { describe, expect, test } from 'vitest'
import { serializeSnapshot } from './snapshot'
import { validateRepoSnapshots } from './repoSnapshots'
import { articulatedDeck } from '../articulatedFixture'
import { catalog } from '../catalog'

const FILE = 'deck-001-illustrative.json'
const DISPLAY = 'hosyond-7in-touch@1'
const label = () => ({
  file: FILE,
  deck: 'Deck 001',
  status: 'illustrative',
  calibration: 'uncalibrated',
  authoritative: false,
  asBuilt: false,
  notes: 'Illustrative placements only.',
  unverifiedIdentities: [{ ref: DISPLAY, note: 'Mounting-hole and connector positions await physical evidence.' }],
})
const files = (index: unknown = { snapshots: [label()] }, snapshot: string = serializeSnapshot(articulatedDeck)) =>
  ({ 'index.json': JSON.stringify(index), [FILE]: snapshot })

const errors = (input: Record<string, string>) => validateRepoSnapshots(input, catalog)

describe('repository snapshot validation', () => {
  test('accepts a canonical, honestly labelled snapshot', () => {
    expect(errors(files())).toEqual([])
  })

  test('requires the index and strict, parseable labels', () => {
    expect(errors({ [FILE]: serializeSnapshot(articulatedDeck) }).join('\n')).toMatch(/index\.json: missing/)
    expect(errors({ 'index.json': 'not json', [FILE]: 'x' }).join('\n')).toMatch(/index\.json: not valid JSON/)
    expect(errors(files({ snapshots: [{ ...label(), extra: true }] })).join('\n')).toMatch(/Unrecognized key/)
  })

  test.each([
    ['authoritative: true', { authoritative: true }],
    ['asBuilt: true', { asBuilt: true }],
    ['a calibrated claim', { calibration: 'calibrated' }],
    ['status as-built', { status: 'as-built' }],
    ['status measured', { status: 'measured' }],
  ])('a label claiming %s is rejected: stronger wording needs a deliberate schema change backed by physical evidence', (_, patch) => {
    expect(errors(files({ snapshots: [{ ...label(), ...patch }] })).length).toBeGreaterThan(0)
  })

  test.each([
    ['extra snapshot not listed', () => ({ ...files(), 'stray.json': serializeSnapshot(articulatedDeck) }), /stray\.json: not listed in index\.json/],
    ['listed snapshot that does not exist', () => ({ 'index.json': JSON.stringify({ snapshots: [label()] }) }), /deck-001-illustrative\.json: listed in index\.json but missing/],
  ])('%s is reported', (_, input, message) => {
    expect(errors(input()).join('\n')).toMatch(message)
  })

  test('the file name must carry its status while the status is illustrative', () => {
    const renamed = 'deck-001.json'
    const input = { 'index.json': JSON.stringify({ snapshots: [{ ...label(), file: renamed }] }), [renamed]: serializeSnapshot(articulatedDeck) }
    expect(errors(input).join('\n')).toMatch(/deck-001\.json: file name must include "illustrative"/)
  })

  test('every snapshot is checked against the real catalog and in every pose', () => {
    const badRevision = serializeSnapshot({ ...articulatedDeck, enclosure: { id: 'case-2800-preview', revision: 9 } } as never)
    expect(errors(files(undefined, badRevision)).join('\n')).toMatch(/case-2800-preview@9 is not in the catalog/)
    const lidOnBox = serializeSnapshot({ ...articulatedDeck, enclosure: { id: 'placeholder-box', revision: 1 } })
    expect(errors(files(undefined, lidOnBox)).join('\n')).toMatch(/has no lid/)
  })

  test('a committed snapshot must be canonical v2 bytes, not merely parseable', () => {
    const pretty = JSON.stringify(articulatedDeck, null, 4)
    expect(errors(files(undefined, pretty)).join('\n')).toMatch(/not canonical/)
  })

  test('a v1 snapshot is not accepted as a committed snapshot', () => {
    const v1 = JSON.stringify({ schemaVersion: 1, units: 'mm', coordinateSystem: 'right-handed-z-up', enclosure: { id: 'placeholder-box', revision: 1 }, placements: [], createdAt: '2026-01-01T00:00:00Z', modifiedAt: '2026-01-01T00:00:00Z' })
    expect(errors(files(undefined, v1)).join('\n')).toMatch(/not canonical|schema version 2/)
  })

  test('the display must remain flagged for unresolved physical details', () => {
    expect(errors(files({ snapshots: [{ ...label(), unverifiedIdentities: [] }] })).join('\n')).toMatch(/hosyond-7in-touch@1.*unverified/)
    expect(errors(files({ snapshots: [{ ...label(), unverifiedIdentities: [{ ref: 'raspberry-pi-5@1', note: 'Not the display.' }] }] })).join('\n')).toMatch(/hosyond-7in-touch@1.*unverified/)
  })

  test('a duplicate index entry is rejected', () => {
    expect(errors(files({ snapshots: [label(), label()] })).join('\n')).toMatch(/duplicate entry/)
  })

  test('index and every other file are JSON; non-JSON stray files are reported', () => {
    expect(errors({ ...files(), 'notes.txt': 'not a snapshot' }).join('\n')).toMatch(/notes\.txt: not listed/)
  })
})
