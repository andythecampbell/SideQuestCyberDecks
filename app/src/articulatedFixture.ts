import { deck001 } from './fixtures'
import { migrateV1ToV2, ConfigurationV2 } from './domain/articulated'

const illustrativePositions: Record<string, [number, number, number]> = {
  keyboard: [-140, -105, -80], pi: [-140, 20, -80],
  power: [30, 20, -80], display: [-82, 64, 20],
}
/** Authored illustrative placements, not measured mounting locations or a migration. */
export const articulatedDeck = ConfigurationV2.parse({
  ...migrateV1ToV2(deck001),
  enclosure: { id: 'case-2800-preview', revision: 1 },
  placements: migrateV1ToV2(deck001).placements.map(p => ({
    ...p,
    attachment: p.id === 'display' ? 'lid' : 'base',
    rotation: p.id === 'display' ? [1, 0, 0, 0] : p.rotation,
    position: illustrativePositions[p.id],
  })),
})
