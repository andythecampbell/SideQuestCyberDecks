# architecture-recheck — read-only independent final review

Actual model: claude-sonnet-5-5. Status: success. No permission denials. Full raw JSON retained outside repository in sidequest-preparation/architecture-recheck.json.

**passed_for_provisional_code: true**

I only read files. I did not run tests or the converter, open the evidence logs, or look at any binary assets. I'm relying on `review-disposition.md` for the test counts (28 tests across 6 files) and the build and conversion results. This pass does not mean calibrated, ADR accepted, or UI verified.

## Prior blockers

- **B1 (sources and Id) is fixed.**
  - `catalogPrimitives.ts` now holds the shared kebab-case `Id` and a strict `Source`.
  - `articulatedSchema.ts:9-10` uses both, with `sources: z.array(Source).min(1)`.
  - `catalog.ts:3-4` imports from the primitives file and the schema file. I found no import cycle.
  - `case-2800-preview.json:44-50` has a GrabCAD source, with the URL and license marked TODO and rights uncleared. No URL is invented.
  - The test at `articulation.test.ts:79-81` rejects a bad Id, missing sources, empty sources and extra source keys.
- **B2 (legacy resolve) is fixed.** `articulation.test.ts:82-85` runs `migrateV1ToV2(deck001)` through `resolve` against the real `placeholder-box@1`. It checks both poses, expects every attachment to be `base`, and expects the placements to equal `deck001.placements`. The v1 enclosure path in `articulated.ts:50` still rejects a lid attachment.

## Other fixes

I found no new architectural blockers.

- **Viewport (`Viewport.tsx:23-28`).** Resolution failures are caught and shown as an in-canvas alert, so the Canvas stays up.
- **Missing preview mappings.**
  - `previewAssets.ts:3-13` builds the URL map from the manifest.
  - Only keyboard@1 and power@1 may fall back to estimate boxes.
  - Anything else shows a visible "Missing preview mapping" alert, so the earlier silent fallback is gone.
- **Case OPEN transform.** `articulation.test.ts:86-92` covers the actual case OPEN lid transform: position `[0,136.55,137.8]` and quaternion x of −√½.
- **Frames and composition.** The frame code and composition tests are retained.

## Blockers

None for provisional code.

## Recommendations

1. **`resolve` signature.** Its enclosure parameter is still the loose `{id, revision, schemaVersion}` (`articulated.ts:34`) and is reparsed at `:45`. Type it as `EnclosureDefinition`. The test at `articulation.test.ts:63` relies on the loose form.
2. **World versus local fields.** `articulated.ts:57` overwrites `position` and `rotation` with world values. A separate `world` field would avoid confusing the two.
3. **Union diagnostics.** `catalog.ts:81` and `:84` still use `z.union`, so a bad entry reports failures from every branch. A discriminated union on `schemaVersion` and `kind` would give clearer errors.
4. **Source ID format.** `ConfigurationV2`'s `Ref` (`articulated.ts:8`) still uses plain `z.string()` for the ID.
5. **Hardcoded UI text.** I did not re-read `PreviewControls.tsx`. If the 120/210 and 90.7577 values are still hardcoded there, render them from the enclosure record instead.
6. **Mesh-selection hardening.** This is described in the disposition, but I did not read `convert.cjs` or `groups.test.cjs`. The independent verifier or the human should confirm it.
7. **Fixture coupling.** The earlier fixture-coupling note (`articulatedFixture.ts`) is unverified in this pass.

## Unresolved acceptance gates

- Calibration is still UNRESOLVED. That covers the datums, pivot `[0,137.175,0.625]`, the +X axis, the sign and the reference driver. It also covers the 0.7577° gap between the 120/210 source labels and the observed 90.7577° export delta, and the residual tolerances.
- The source versions are not confirmed to match.
- Separate-part correspondence and fit validation are unverified.
- Natural display and Pi orientation are unverified.
- The case, Pi and display source URLs and licenses are unresolved, and rights are uncleared.
- The browser smoke test is blocked because Chrome failed to launch (missing `libnspr4.so`). It still needs both poses, keyboard controls, stable selection, framing and real loader-error behavior.
- The ADR stays Proposed. It needs independent reviews and a human decision.
- The closed base and lid bounds overlap by about 50 mm. This was flagged in the earlier review. The disposition says overlapping bounds don't prove a grouping error, but nothing yet explains the overlap.
