# Generator spike (issue #9)

A bounded headless test of one engine, Replicad/OpenCascade.js. It generates a small synthetic plate from explicit numbers and writes geometry suitable for software inspection plus a manifest. **It is not a Deck 001 generator.** The fixture is invented, labelled non-fabrication, and must never be printed as a Deck 001 part. See [ADR 0002](../../docs/decisions/0002-replicad-headless-generator-spike.md) and the [evidence](../../evidence/issue-9/README.md).

This package is outside the app workspace, so its engine and 23 MB WebAssembly build never reach the app bundle.

```sh
# From the repository root:
npm ci --prefix tools/generator-spike
env -u NODE_ENV npm --prefix tools/generator-spike test
env -u NODE_ENV node tools/generator-spike/src/cli.mjs \
  --request tools/generator-spike/fixtures/synthetic-plate.non-fabrication.request.json \
  --out /tmp/spike-run
```

The command prints a JSON summary. It writes `NON-FABRICATION-synthetic-plate-r1.stl`, `NON-FABRICATION-synthetic-plate-r1.step` and `manifest.json` into a directory that must be absent or empty. Publication requires the output directory's parent to be an existing, trusted, stable directory on one filesystem. Staging plus rename provides ordinary same-filesystem publication; it is not a claim of race safety or crash durability. If an existing empty target is removed and the final rename then fails, the target remains absent rather than being recreated empty; no partial output is published.

A refused or failed run exits non-zero and prints a JSON diagnostic on stderr. Validation, guard, preflight, kernel and verification failures occur before publication. Ordinary publication failures clean their staging directory; an injected cleanup failure is reported separately while preserving the original publication error.

| Exit | Meaning |
| --- | --- |
| 2 | Bad usage, an unreadable or invalid request, a refused fabrication request, or a non-empty output directory |
| 3 | Geometry refused before the kernel, or the kernel failed |
| 4 | Generated output failed verification |
| 5 | Engine or internal failure |

Non-fabrication requests carry only values with `"class": "synthetic"`. Fabrication requests are always refused here, because the only template is non-fabrication. Their inputs are still checked in full, so validation and guard refusals list per-input issue paths: `physical-fact` inputs need `measured` or `datasheet` confidence with a durable source, and `design-parameter` inputs need an author, a rationale and an explicit test-evidence status. Filesystem and internal errors instead use stage-level diagnostics.

Repository evidence paths are resolved beneath the canonical repository root. Every component below that root must be non-symlink, and the final canonical path must remain contained. Citation existence establishes only that a non-empty record is present; it does not prove that the record supports the cited number.

Regeneration is deterministic with the pinned engine and normalized export settings described in the ADR.
