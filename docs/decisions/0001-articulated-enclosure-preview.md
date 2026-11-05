# 0001: Two-body articulated enclosure preview

Status: **Accepted as authorized implementation direction**. Decision owner: Andy. Issue #2 authorizes an enclosure preview driven by enclosure-authored pose transforms, with components explicitly placed relative to the top or bottom. This decision records that direction; it does not accept Deck 001 calibration or assert issue completion.

Enclosures author the transforms for their supported poses; components declare their top/bottom-relative attachment and local transform. The preview composes those transforms so attached components follow the selected enclosure pose. Exact reproduction of Deck 001 hinge calibration or exported assembly endpoints remains an issue-closure gate, not a claim made by this provisional draft.

The existing box catalog and v1 fixture remain unchanged. A strict v2 enclosure has exactly base/lid and one hinge; a strict v2 configuration records a world/base transform and body-local component transforms. The pure resolver owns all spatial composition:

`worldComponent = worldBase * translate(pivot) * rotate(axis, sign * (driver - referenceDriver)) * translate(-pivot) * referenceLid * localComponent`

The base uses identity instead of the hinge expression. The scene consumes flat resolved transforms. OPEN/CLOSED is UI inspection state and never updates design timestamps. The adapter preserves every legacy placement on identity base, including the legacy display. No arbitrary graph, solver, persistence infrastructure, backend or fabrication path is introduced.

## Explicit provisional assumptions

- Both temporary body datums share CLOSED assembly coordinates, in mm/RH/Z-up. The closed lid mesh already contains its exported occurrence placement, so the temporary reference transform is identity, not that placement applied again.
- Candidate pivot `[0,137.175,0.625]`, +X unit axis; assumed driver reference CLOSED=210 and sign +1. OPEN=120 derives a −90° rotation from the same hinge. None of these values is accepted calibration.
- Independently recorded exports differ by −90.75770394990006° about +X. The unexplained angular discrepancy is **0.75770394990006°**. We do not scale driver values, snap a second endpoint, or approve residual tolerances.
- Display/Pi normalization and mounting positions are illustrative. Pi's provisional natural orientation is `(-y,x,z)` followed by minimum-corner subtraction; display uses source orientation and minimum-corner subtraction, then its illustrative lid placement turns it 180° about X to face into the closed case. The catalog engineering estimates are unchanged. No physical fit follows from mesh bounds.

## Asset boundary

Offline `occt-import-js@0.0.23` produces mm meshes. A small GLB writer exports `(x,z,-y)/1000`, standard meters/Y-up. The renderer applies +90° X and uniform 1000 exactly once inside each visible asset, independent of body placement. This unit conversion is not component rescaling to fit. Runtime has no CAD kernel. A separately pinned converter/validator and hash/normalization manifest document the derivation.

Base/lid are the CLOSED assembly's named Part 1/Part 2 occurrences (13/8 solids), avoiding unknown separate-part placement semantics. Original separate parts are retained and hashed. Full correspondence/frame comparison with them and review of geometric residuals remain required before issue closure. Open/closed assembly scenes are never switched as animation endpoints.

The small preview lookup is keyed by catalog revision and optional body. Legacy revisions are retained. Part-specific failures display an error without substitute geometry. Mesh overlays are visibly suppressed; keyboard/power remain estimated envelopes. CAD provenance is separate from engineering confidence. Case/Pi GrabCAD URLs and licenses, and display license URL, remain TODO under the user's explicit deferral; this public repository has no cleared-rights claim.

## Acceptance and calibration follow-up

Product acceptance concerns enclosure-authored poses, explicit top/bottom-relative component placement, and correct transform composition. Browser smoke (both poses, keyboard controls, stable selection, labels, framing, missing mesh) and independent final correctness/architecture review status are tracked in the evidence summary.

Deck 001 datum, sign/reference/driver authority, source version/configuration correspondence, assembly comparisons with positional/angular residuals and reviewed tolerances, and human discrepancy disposition remain issue-closure gates. The observed discrepancy is retained as provenance and this draft does not claim calibration. No fit/fabrication acceptance is asserted. See [evidence and acceptance mapping](../../evidence/README.md).

The 120/210 driver literals describe this provisional Deck 001 case. The current strict v2 schema remains limited to exactly two bodies (base/bottom and lid/top) and one hinge; accepting generic enclosure-authored poses does not claim support for arbitrary body graphs, additional joints or a solver. Unit declarations are attributed to recorded preparation evidence, not parsed by this converter. Natural component orientation remains unverified; a transformed illustrative +Z normal does not verify the source display face.
