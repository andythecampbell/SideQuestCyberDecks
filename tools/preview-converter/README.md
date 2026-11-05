# Offline curated preview conversion

Run from the repository root:

```sh
npm ci --prefix tools/preview-converter --include=dev
node tools/preview-converter/convert.cjs
npm test
```

This directory is outside the application workspace dependency graph. Its exact lock pins `occt-import-js@0.0.23` and `gltf-validator@2.0.0-dev.3.10`; neither ships to the browser. During implementation the identical preinstalled scratch converter dependencies were copied here, without modifying the scratch evidence. The original scratch converter was reviewed: its baked STEP placements and standard GLB mapping informed this bounded writer; its hard-coded main-checkout path and app Three.js dependency were not retained.

The script reads unchanged STEP originals, requests millimeter output, absolute linear deflection 0.25 mm and angular deflection 0.5 (OCCT option), then writes four previews and a manifest. Preparation evidence (`sidequest-preparation/asset-feasibility.md` and `asset-inventory.json`) records Onshape geometry contexts as meters and Pi contexts as millimeters; this converter requests output units but does not parse source unit declarations. A file-wide METRE string heuristic would be incorrect for Pi's derived units. Standard GLB mapping is `(x,z,-y)/1000`; the renderer reverses it once. No fit scaling. Component orientation/minimum subtraction is recorded, distinct from placement.

The CLOSED assembly's named Part 1/Part 2 occurrences supply base/lid in the same exported frame. The selector requires exactly one assembly containing unique direct `Part 1` / `Part 2` nodes, with 13/8 distinct references covering all 21 meshes. Mesh names are actually empty strings; these are asserted and recorded with per-solid raw source-frame bounds and the full CLOSED hierarchy. The previous index slices match these verified occurrences; overlapping bounds do not prove incorrect grouping. Supplied separate parts remain hashed sources; their frame correspondence has not been accepted. The preview uses one reference mesh and hinge, never independent endpoint scene replacement. Every output runs glTF validation. Total output budget: 6 MB across the four GLBs (currently approximately 4.7 MB); no assembly-reference GLBs are bundled.

Regeneration is deterministic with the pinned WASM converter and writer in the same Node environment. Manifest SHA-256, source hashes, bounds and canonical normalization are checked by Node tests. The JSON manifests contain no conversion timestamps. Run twice and compare hashes to verify reproducibility. Output hashes/bounds establish artifact consistency, not engineering fidelity or calibrated assembly agreement.

Provenance: case/Pi from GrabCAD; display authored by Andy, user confirmed. Source URLs/licenses remain TODO under explicit user deferral; no cleared rights claim. Physical measurement, datum and driver calibration, separate-part comparisons and discrepancy disposition remain gates in [ADR 0001](../../docs/decisions/0001-articulated-enclosure-preview.md).
