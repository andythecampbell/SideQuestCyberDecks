# Articulated 2800 implementation evidence

This is a **bounded provisional implementation**, not closure of issue #2. The authorized implementation direction is enclosure-authored pose transforms with components explicitly placed relative to the top or bottom. Exact Deck 001 hinge calibration and assembly agreement remain issue-closure gates and are not claimed by this draft. Branch `feat/articulated-deck-001`, baseline `93ce11b1184f7565aa829d9887cf07a32bc5ffa9`. No orphan server/process is required to review these files.

**Final handoff:** the log series below records the initial implementation. Review fixes and their earlier **28 app tests / 2 converter tests / passing build** are indexed in [review disposition](review-disposition.md). Current verification is **30 app tests / 2 converter tests / passing build**. Sandboxed dev-browser results are in [browser QA](browser-qa.md): both poses and mouse/keyboard controls passed five consecutive StrictMode runs with all GLBs 200 and no normal-flow errors or failed requests. Exact Deck 001 calibration remains unresolved and blocks issue closure, not review of this provisional draft.

## Test-first record

Actual outputs are retained as `01`–`09` `red.log` / `green.log` pairs. RED commands exited nonzero; GREEN commands exited zero after implementation/correction. Some stages include related schema/fixture assertions within the same tracer, rather than one assertion per invocation. Missing-module REDs establish absent behavior; they are not runtime assertion failures.

| Tracer | Actual RED | GREEN |
| --- | --- | --- |
| 01 rigid composition | missing articulation module | 6 tests pass |
| 02 schema, adapter, hinge/attachments | missing articulated module | 10 tests pass |
| 03 GLB frame conversion | missing previewFrame module | 11 tests pass |
| 04 catalog v2 integration | articulated catalog rejected | 12 tests pass |
| 05 fixture and controls/errors | missing PreviewControls module | 14 tests pass |
| 06 application integration | expected UNRESOLVED notice absent | 15 tests pass |
| 07 unsupported enclosure version | resolver failed to throw | 16 tests pass |
| 08 revision-specific preview lookup | missing previewAssets module | 18 tests pass |
| 09 illustrative display orientation | identity quaternion instead of inward-facing placement | 20 tests pass |

During development, exact equality encountered ordinary floating-point `5.000000000000001` and signed zero; the rigid-transform assertion now uses 10-decimal comparison and the point adapter normalizes zero. No engineering/calibration tolerance was changed. A catalog/configuration import cycle was found during integration and removed by separating the articulated schema. Additional regression tests check a nonidentity reference and the actual rendering quaternion/scale against the pure GLB conversion.

`final-test.log` records the original **21 tests in 5 files**; current verification passes **30 tests in 8 files**. `final-build.log` and the current rerun show TypeScript and Vite production build pass. The build reports a >500 kB chunk warning; bundle restructuring is outside scope. Sandboxed browser smoke is documented separately in [browser QA](browser-qa.md); server-rendered markup assertions remain distinct from that interactive evidence.

## Artifacts and immutable inputs

- `immutable-inputs.log` compares all six STEP files, v1 fixture, all five baseline catalog files and root lockfile byte-for-byte with the baseline commit, with actual SHA-256 values.
- `conversion.log` records glTF validation for all four actual meshes: zero errors, warnings, infos and hints. Meshes total 4,695,400 bytes, below the 6 MB preview budget. Sources, output hashes, tessellation options, normalization, bounds, provenance and revision keys are in `app/public/previews/manifest.json`.
- `reproduction-before.json`, `reproduction.log`, and `reproduction-check.log` record an actual repeated converter run with byte-identical four GLBs and manifest. Pinned converter dependencies are separate from app runtime. See `tools/preview-converter/README.md`.
- `observed-export-pose.json` is copied unchanged from the preparation's independently observed evidence. It is attributed historical evidence, not a newly executed STEP comparison or accepted calibration.
- Artifact tests independently hash inputs/outputs and decode every GLB position through the loader frame contract to compare canonical bounds. Their Float32 precision check is not a geometric agreement or fit tolerance.

## Partial acceptance mapping

| Product criterion / implementation scope | Evidence / remaining work |
| --- | --- |
| Exactly base/lid, one hinge, pure TS, strict v2 | New schema, resolver, catalog integration and Node tests. Calibration status is constrained to UNRESOLVED. |
| Immutable sources and reproducible assets | Hash checks, offline converter, manifest, repeated run, actual glTF validation. Separate-part/assembly datum correspondence remains unapproved provenance and a nonblocking calibration follow-up. Base/lid previews use CLOSED assembly named Part 1/Part 2 occurrences, not guessed separate-part placements. |
| Original source labels, one joint | OPEN=120/CLOSED=210 unchanged; a single hinge derives a −90° delta under named assumptions. **Not calibrated.** |
| Enclosure-authored poses and explicit top/bottom-relative components | Current strict v2 maps bottom to base and top to lid, with exactly two bodies and one hinge. Generic product behavior does not imply arbitrary graph or multi-joint support. |
| Attachment and transform invariants | Nonidentity base, non-origin hinge, nonidentity reference, base component invariance, lid attachment, repeated toggles, JSON roundtrip. |
| Strict invalid/reference handling | Invalid transforms/axis, schema/pose, attachment, missing catalog ref, duplicate IDs and unknown fields covered. |
| Legacy compatibility | Byte-identical catalog/fixture; adapter preserves every placement on identity base; legacy scene path retained. |
| Accessible controls and honest scene | Native pressed buttons, flat scene transforms, selection state separate from pose, body-local details, per-part Suspense/error boundary; visible overlay suppression, estimates and unresolved provenance. Sandboxed browser QA passed both poses plus mouse/Enter/Space controls; stable mesh/list selection and quantitative camera framing remain follow-up. |
| No fabrication or trusted fit claims | Visible illustrative/not-fit-validated notices; no editing, generated parts, ports/cutouts, backend or solver introduced. |
| Tests/build | Actual final logs pass. |
| Independent final reviews | Earlier provisional correctness/architecture rechecks passed; fresh Claude review of the runtime fixes passed after two documentation-only blocker cycles. Human approval remains required. |
| ADR/conventions | ADR accepts the product behavior; Deck 001 calibration remains provisional. |

## Deck 001 calibration required before issue closure

The candidate assembly-frame hinge `[0,137.175,0.625]`, +X axis, identity CLOSED reference, reference driver 210, sign +1 and temporary body datums are **provisional assumptions**, not accepted calibration. Source drivers imply 90°; independent export delta is 90.75770394990006°. The 0.75770394990006° discrepancy remains unexplained. No endpoint snapping, source-angle rescaling or tolerance widening is used.

Before claiming calibrated Deck 001 assembly agreement or closing issue #2: approve datum/reference/sign/authority, confirm matching source versions/configurations, reproduce both assembly comparisons with reviewed positional/angular residual tolerances, and obtain Andy's explicit discrepancy disposition. Component natural orientation/mounting remains illustrative; physical fit is unvalidated. Case/Pi source URLs/licenses and display license URL remain deferred TODOs in this already-public repository; no cleared rights are claimed.

Browser QA now covers both poses, mouse and keyboard activation, all four GLB loads, and normal-flow runtime/network cleanliness; see [browser QA](browser-qa.md). Stable mesh/list selection and quantitative camera framing remain follow-up. The earlier display-failure screenshot visually shows a part-specific error with other geometry retained, but its historical automated selector reported false and was not promoted to a fresh passing assertion. No issue completion is asserted.
