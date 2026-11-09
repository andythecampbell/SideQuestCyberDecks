# Issue #9 evidence: Replicad/OpenCascade.js generator spike

Automated records for the bounded headless generator spike. These are software records. Nothing here validates physical fit, and spike output must never be printed as a Deck 001 part. Decision: [ADR 0002](../../docs/decisions/0002-replicad-headless-generator-spike.md). Andy's interactive CAD or slicer check and ADR acceptance remain pending and are listed on the PR.

## Reproduce

From the repository root, on a clean tree:

```sh
npm ci --prefix tools/generator-spike
env -u NODE_ENV npm --prefix tools/generator-spike test
bash evidence/issue-9/run-acceptance.sh
bash evidence/issue-9/run-mutations.sh
```

`run-acceptance.sh` needs `EXT_PYTHON` (Python with `trimesh`, `numpy`, `scipy` and `cadquery-ocp`), `ADMESH_BIN` and optionally `NODE24_BIN` for the external and cross-runtime records. Without them, the external step records that it was skipped. The recorded run used a scratch `venv` outside the repository (trimesh 4.12.2, cadquery-ocp 8.0.1.1.0), the `admesh` 0.98.4 Debian package extracted to a scratch directory without installing it, and the checksum-verified official Node.js v24.22.2 tarball.

## Test-first record

Each `NN-*.red.log` is raw Node test runner output plus the exit code, captured before the matching production code existed. Logs retained with the `observed` label are genuine first-run findings rather than planned RED steps.

| Log | Slice | RED observed |
| --- | --- | --- |
| 01 | strict request contract | missing `src/request.mjs` |
| 02 | fabrication guard | missing `src/guard.mjs` |
| 03 | refusal writes no artifact | missing `src/cli.mjs` |
| 04 | preflight diagnostics | `expectedGeometry` not implemented |
| 05 | STL and STEP output analysis | missing `src/verify.mjs` |
| 06 | kernel build | missing `src/engine.mjs` |
| 06b | observed: fillet float noise | the first exact-bounds assertion failed on `-4.4e-16`. The test now asserts exact dimensions and bounded origin noise, and the raw bounds are recorded. |
| 07 | export, verify, manifest | `NOT_IMPLEMENTED` from the pipeline |
| 08 | observed: STEP product counter | a kernel reused in one process wrote different STEP bytes |
| 08b | STEP product name normalization | counter not normalized |
| 09 | fixture unlike Deck 001 data | three coincidental value collisions with catalog data |
| 10 | kernel exception decoding | message was only `[object WebAssembly.Exception]` |

## Acceptance records

| Log | Records |
| --- | --- |
| [11-packaging.log](11-packaging.log) | clean `npm ci` with an empty npm cache, sizes, WASM hash |
| [12-two-clean-runs.log](12-two-clean-runs.log) | two fresh-directory runs, hash comparison, headers, STEP entities, manifest summary |
| [sample-output/manifest.json](sample-output/manifest.json) | one complete generated manifest. Geometry files are deliberately not committed, so no printable spike part sits in the repository. |
| [13-rejected-fabrication.log](13-rejected-fabrication.log) | the rejected-fabrication fixture: every issue listed, exit 2, no output directory |
| [14-external-validation.log](14-external-validation.log) | trimesh, ADMesh and native OpenCascade results, plus the same validator rejecting a deliberately damaged copy |
| [15-cross-runtime.log](15-cross-runtime.log) | Node 22 vs Node 24 primary output comparison |
| [16-kernel-reuse.log](16-kernel-reuse.log) | 25 runs on one kernel: time and memory |
| [17-mutations.log](17-mutations.log) | 19 source sabotages, each killed by the named test and reverted |
| `final-tool-test.log`, `final-test.log`, `final-build.log`, `final-diff-check.log` | final gates (`npm --prefix tools/generator-spike test`, `npm test`, `npm run build`, `git diff --check`) |

## Acceptance mapping (issue #9)

| Criterion | Evidence |
| --- | --- |
| (A) Two clean runs identical | Test `two clean separate-process CLI runs are byte-identical`, log 12 |
| (A) Dimensions equal inputs, one closed solid | Tests `the STL is one closed oriented solid…`, `the STEP file declares millimetres…`, `builds one solid…`, logs 12 and 14 |
| (A) Fabrication refuses unqualified facts, no artifact | `guard.test.mjs`, `cli-refusal.test.mjs`, log 13, mutations M03–M07 and M09 |
| (A) Synthetic fixture cannot be fabrication-labelled | Tests `the synthetic fixture cannot be relabelled for fabrication`, `refuses synthetic values in a fabrication request`, manifest fields, mutations M07 and M08 |
| (A) Generator path free of preview, mesh and placement data | `purity.test.mjs`, mutations M17 and M18, and the fixture-collision test |
| (H) ADR records evidence and outcome, Andy accepts | [ADR 0002](../../docs/decisions/0002-replicad-headless-generator-spike.md). **Acceptance pending.** |
