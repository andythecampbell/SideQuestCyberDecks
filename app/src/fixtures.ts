import { IDENTITY, type Configuration } from './domain/configuration'

/** Starting arrangement for Deck 001 in the placeholder box. The display sits roughly where a lid would be. */
export const deck001: Configuration = {
  schemaVersion: 1,
  units: 'mm',
  coordinateSystem: 'right-handed-z-up',
  enclosure: { id: 'placeholder-box', revision: 1 },
  placements: [
    { id: 'keyboard', component: { id: 'adafruit-mini-chiclet-keyboard', revision: 1 }, position: [25, 5, 0], rotation: IDENTITY },
    { id: 'pi', component: { id: 'raspberry-pi-5', revision: 1 }, position: [20, 125, 0], rotation: IDENTITY },
    { id: 'power', component: { id: 'anker-10000-30w', revision: 1 }, position: [160, 140, 0], rotation: IDENTITY },
    { id: 'display', component: { id: 'hoysond-7in-touch', revision: 1 }, position: [67, 60, 90], rotation: IDENTITY },
  ],
  createdAt: '2026-10-07T00:00:00.000Z',
  modifiedAt: '2026-10-07T00:00:00.000Z',
}
