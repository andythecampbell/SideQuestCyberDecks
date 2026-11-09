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

const CORNERS = (v) => [
  { name: 'min-x/min-y', x: [0, v.cornerRadius], y: [0, v.cornerRadius] },
  { name: 'max-x/min-y', x: [v.plateSizeX - v.cornerRadius, v.plateSizeX], y: [0, v.cornerRadius] },
  { name: 'min-x/max-y', x: [0, v.cornerRadius], y: [v.plateSizeY - v.cornerRadius, v.plateSizeY] },
  { name: 'max-x/max-y', x: [v.plateSizeX - v.cornerRadius, v.plateSizeX], y: [v.plateSizeY - v.cornerRadius, v.plateSizeY] },
]

/** Footprints of all cut features as `{ name, path, x: [min, max], y: [min, max] }`. */
export function featureFootprints(v) {
  const box = (name, prefix) => ({
    name,
    path: `inputs.${prefix}MinX`,
    pathY: `inputs.${prefix}MinY`,
    x: [v[`${prefix}MinX`], v[`${prefix}MinX`] + v[`${prefix}SizeX`]],
    y: [v[`${prefix}MinY`], v[`${prefix}MinY`] + v[`${prefix}SizeY`]],
  })
  const hole = (index) => {
    const prefix = `hole${index}`
    const radius = v[`${prefix}Diameter`] / 2
    return {
      name: prefix,
      path: `inputs.${prefix}X`,
      pathY: `inputs.${prefix}Y`,
      x: [v[`${prefix}X`] - radius, v[`${prefix}X`] + radius],
      y: [v[`${prefix}Y`] - radius, v[`${prefix}Y`] + radius],
    }
  }
  return [box('through-cut', 'throughCut'), box('pocket', 'pocket'), hole(1), hole(2), hole(3)]
}

const intersect = (a, b) => a.x[0] < b.x[1] && b.x[0] < a.x[1] && a.y[0] < b.y[1] && b.y[0] < a.y[1]

/**
 * Checks that the explicit inputs describe buildable geometry before the kernel runs.
 * Returns one issue per problem. These checks prevent known-bad requests from reaching
 * the kernel; the kernel's own failures are diagnosed separately during the build.
 */
export function preflight(v) {
  const issues = []
  const positive = [
    'plateSizeX', 'plateSizeY', 'plateThickness', 'cornerRadius',
    'throughCutSizeX', 'throughCutSizeY',
    'pocketSizeX', 'pocketSizeY', 'pocketDepth',
    'hole1Diameter', 'hole2Diameter', 'hole3Diameter',
  ]
  for (const name of positive) {
    if (!(v[name] > 0)) issues.push({ code: 'DIMENSION_NOT_POSITIVE', path: `inputs.${name}`, message: `${name} must be greater than 0 mm (got ${v[name]}).` })
  }
  if (issues.length > 0) return issues

  if (!(v.cornerRadius < Math.min(v.plateSizeX, v.plateSizeY) / 2)) {
    issues.push({ code: 'CORNER_RADIUS_TOO_LARGE', path: 'inputs.cornerRadius', message: `Corner radius ${v.cornerRadius} mm must be under half the smaller plate side.` })
  }
  if (!(v.pocketDepth < v.plateThickness)) {
    issues.push({ code: 'POCKET_TOO_DEEP', path: 'inputs.pocketDepth', message: `Pocket depth ${v.pocketDepth} mm must be less than the plate thickness ${v.plateThickness} mm.` })
  }

  const features = featureFootprints(v)
  for (const feature of features) {
    if (feature.x[0] <= 0 || feature.x[1] >= v.plateSizeX) {
      issues.push({ code: 'FEATURE_OUTSIDE_PLATE', path: feature.path, message: `${feature.name} spans x ${feature.x[0]}..${feature.x[1]} mm, outside the plate.` })
    }
    if (feature.y[0] <= 0 || feature.y[1] >= v.plateSizeY) {
      issues.push({ code: 'FEATURE_OUTSIDE_PLATE', path: feature.pathY, message: `${feature.name} spans y ${feature.y[0]}..${feature.y[1]} mm, outside the plate.` })
    }
    for (const corner of CORNERS(v)) {
      if (intersect(feature, corner)) {
        issues.push({ code: 'FEATURE_IN_CORNER', path: feature.path, message: `${feature.name} enters the ${corner.name} corner radius region.` })
      }
    }
  }
  for (let i = 0; i < features.length; i += 1) {
    for (let j = i + 1; j < features.length; j += 1) {
      if (intersect(features[i], features[j])) {
        const [low, high] = [features[i], features[j]]
        issues.push({ code: 'FEATURES_OVERLAP', path: low.path, message: `${low.name} overlaps ${high.name}.` })
        issues.push({ code: 'FEATURES_OVERLAP', path: high.path, message: `${high.name} overlaps ${low.name}.` })
      }
    }
  }
  return issues
}

/** Tessellation chordal tolerance for the primary STL export, in mm. */
export const STL_LINEAR_DEFLECTION_MM = 0.01
/** Tessellation angular tolerance for the primary STL export, in radians. */
export const STL_ANGULAR_DEFLECTION_RAD = 0.1

/** What the generated part should measure, derived only from the explicit inputs. */
export function expectedGeometry(v) {
  const cylinder = (d) => Math.PI * (d / 2) ** 2 * v.plateThickness
  const volumeMm3 =
    (v.plateSizeX * v.plateSizeY - (4 - Math.PI) * v.cornerRadius ** 2) * v.plateThickness -
    v.throughCutSizeX * v.throughCutSizeY * v.plateThickness -
    v.pocketSizeX * v.pocketSizeY * v.pocketDepth -
    (cylinder(v.hole1Diameter) + cylinder(v.hole2Diameter) + cylinder(v.hole3Diameter))
  // Chords deviate from a true arc by at most the deflection; the area lost along an arc is
  // bounded by deflection * arc length. Applied over the full thickness for each curved wall.
  const curvedPerimeter =
    2 * Math.PI * v.cornerRadius + Math.PI * (v.hole1Diameter + v.hole2Diameter + v.hole3Diameter)
  return {
    units: 'mm',
    dimensionsMm: [v.plateSizeX, v.plateSizeY, v.plateThickness],
    boundsMm: [
      [0, 0, 0],
      [v.plateSizeX, v.plateSizeY, v.plateThickness],
    ],
    volumeMm3,
    meshVolumeToleranceMm3: STL_LINEAR_DEFLECTION_MM * curvedPerimeter * v.plateThickness,
    // Through-cuts and through-holes each add one to the mesh genus; the blind pocket adds none.
    throughFeatureCount: 4,
  }
}
