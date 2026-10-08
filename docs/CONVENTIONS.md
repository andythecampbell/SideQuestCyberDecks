# Conventions

> Status: Draft. These are the starting defaults the code uses today. Review and change them before real assets go in.

## Units

- Millimeters for every stored length. No unit suffixes in field names; the unit is implied by the schema.
- Degrees only in the UI. Stored orientation is a unit quaternion `[x, y, z, w]`.
- Imported files must declare their source units. Never guess.

## Coordinate system

- Right-handed, **Z-up**. This matches CAD tools and OpenCascade/Replicad.
- Three.js defaults to Y-up. The app sets the camera up vector to +Z and keeps the scene in Z-up. Do not rotate assets to fit Y-up; convert once at import and record it.
- +X is width (left to right as you face the deck), +Y is depth (front to back), +Z is height.

## Component origin

Every component's local origin is the **minimum corner of its envelope** (the box that contains the whole part, including connectors). The envelope extends along +X, +Y, +Z from there.

Each component is described in its **natural resting orientation**, which is:

- boards: component side up (+Z), lying flat;
- displays: screen facing +Z, lying flat, with the long edge along X;
- keyboards: keys facing +Z;
- everything else: how it sits on a table.

Positions of holes, ports, and keep-outs are relative to that origin.

Open question: the min-corner origin is easy to measure but not always the most useful. A display might be better anchored at the center of its active area. Revisit once the first generated part needs a datum.

## Measurement confidence

Every measured feature carries a `confidence`:

| Value | Meaning |
|---|---|
| `datasheet` | Taken from a manufacturer drawing or official model |
| `measured` | Measured by hand on a physical part (calipers) |
| `estimate` | Placeholder or rough guess; must not drive generated parts |

Generated parts may use only `datasheet` or `measured` values. An `estimate` should produce a visible warning.

## Identifiers and revisions

- Component and enclosure ids are lowercase kebab-case: `raspberry-pi-5`, `hoysond-7in-touch`.
- `revision` is an integer that increases whenever geometry or interfaces change. Typo fixes don't need a bump.
- A configuration references a component by `id` + `revision`.
- Variants that don't change geometry (e.g. Pi 5 RAM size) are not separate components.

## Catalog files

- One JSON file per component or enclosure revision under `catalog/`.
- Every file is validated against the schema in `app/src/domain/catalog.ts` by the test suite.
- Every file records its sources (datasheets, models, or "measured by hand") and the license of any model it references.

## Domain vs. rendering

- Code in `app/src/domain/` must not import React, Three.js, or anything else that touches the browser. It must run in plain Node tests.
- The 3D scene is a projection of domain state. Never store Three.js objects in domain state.
