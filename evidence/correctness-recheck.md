# correctness-recheck — read-only independent final review

Actual model: claude-sonnet-5-5. Status: success. No permission denials. Full raw JSON retained outside repository in sidequest-preparation/correctness-recheck.json.

**passed_for_provisional_code: true.** This is a static read only. I ran no tests, builds or converter, so the pass counts in the evidence logs (28 app tests, 2 converter tests) are the author's claims, not something I checked.

## Fix checks
- **H1 is fixed.**
  - `tools/preview-converter/groups.cjs:2-24` selects by exact occurrence name. It requires exactly one `2800 Case Assembly` with exactly two children, `Part 1` (13 meshes) and `Part 2` (8 meshes), as direct children.
  - It requires empty solid names, 21 distinct mesh indices, no stray meshes outside those parts, and `result.meshes.length===21`.
  - `convert.cjs:15` calls it.
  - `groups.test.cjs:4-5` covers child reordering, plus a missing child, a duplicated child, overlapping indices, a renamed part and an extra mesh. Each of those mutations should make the selector throw.
  - `previewIntegrity.test.ts:40-44` checks the manifest's per-solid occurrence, name and finite bounds, with counts of 13 and 8.
  - The disposition's reasoning holds: the overlapping base/lid bounds are not a grouping error.
- **M1 is fixed.** `Viewport.tsx:23-28` catches resolution failures, and `:54` shows the message in an alert while the Canvas stays. `Viewport.test.tsx:12-17` covers a missing enclosure, a missing component and a non-finite base position. `articulated.ts:56` throws on a missing component, so the silent `return null` at `Viewport.tsx:65` is never reached.
- **M2 is fixed.**
  - `previewAssets.ts:8-13` allows the estimate fallback only for the keyboard and power entries at revision 1.
  - Any other component or body without a mapping gets a "Missing preview mapping" diagnostic (`Viewport.tsx:60,67`). No undefined URL reaches `useGLTF`.
  - `Viewport.test.tsx:18-32` covers Pi, display and enclosure revision 2.
  - `PreviewMesh.tsx:42` keys the error boundary on `url`, so it resets when the URL changes.
- **M3, M4, M5, M7 are fixed or disclosed.**
  - The manifest carries `rights: 'uncleared'` and `orientation: 'unverified'`, asserted at `previewIntegrity.test.ts:39`.
  - The lookup is derived from the manifest, and `:36` compares the key sets both ways.
  - M5 is disclosed rather than verified. The orientation is not derived from geometry, and the disposition says so.
- **M6 is addressed per the disposition.** I read the Viewport tests and the integrity tests. I did not re-read `articulation.test.ts` for the real-case OPEN numeric test or the placement unknown-key test.
- **Low items.** `useGLTF(url, false)` at `PreviewMesh.tsx:21` stops the Draco CDN fetch, and the URL-keyed boundary fixes the reset.

## Blockers
None in code.

## Remaining gates
- **Calibration is unresolved.** The 90.7577° export delta against the 90° (120/210) source labels has no human disposition. Pivot, datums, reference, sign and source-version matching are unverified, and `open.step` is only hashed.
- **Browser UI smoke is blocked** (missing `libnspr4.so`). These are still unverified:
  - both poses;
  - keyboard controls;
  - stable selection;
  - camera framing;
  - the real loader-error path through `MeshBoundary`.
  - The Viewport tests mock Canvas, drei and `PreviewMesh`, so they don't count as a smoke test.
- **Natural display and Pi orientation is unverified.** The tests assert the resolved illustrative +Z normal, not the real screen or board geometry.
- **Rights and sources are unresolved.** The GrabCAD source URLs and licenses are TODO, and the GLBs in `app/public` remain uncleared.
- **The ADR is still Proposed.** Human acceptance is outstanding.

## Recommendations
- Keep the PR or branch labelled provisional, and don't ship or deploy `app/public/previews` until rights are cleared.
- Run the browser smoke in an environment with Chrome's dependencies. Check both poses, keyboard activation, selection, framing, and a deliberately broken GLB URL.
- Get the calibration disposition, with a residual comparison against `open.step`, before anyone calls the lid transform calibrated.
- Optional hardening: the selector doesn't check that `Part 1` and `Part 2` are the assembly's only children by name, though the count of two plus the unique name matches make this near-equivalent. `Viewport.tsx:30` hard-codes `[0, 0, 100]` for the non-v1 camera defaults, which is harmless.
