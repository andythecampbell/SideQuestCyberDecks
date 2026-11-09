/** Descriptor for the single spike template. Pure data: no kernel, no filesystem. */
export const syntheticPlate = Object.freeze({
  id: 'synthetic-plate',
  revision: 1,
  // A fabrication-capable template is separate later work (roadmap S5).
  purposes: Object.freeze(['non-fabrication']),
  inputs: Object.freeze([
    'plateSizeX',
    'plateSizeY',
    'plateThickness',
    'cornerRadius',
    'throughCutMinX',
    'throughCutMinY',
    'throughCutSizeX',
    'throughCutSizeY',
    'pocketMinX',
    'pocketMinY',
    'pocketSizeX',
    'pocketSizeY',
    'pocketDepth',
    'hole1X',
    'hole1Y',
    'hole1Diameter',
    'hole2X',
    'hole2Y',
    'hole2Diameter',
    'hole3X',
    'hole3Y',
    'hole3Diameter',
  ]),
})

export const TEMPLATES = Object.freeze({ [syntheticPlate.id]: syntheticPlate })
