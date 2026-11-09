# Generator spike (issue #9)

A bounded headless test of one engine, Replicad/OpenCascade.js. It generates a small synthetic plate from explicit numbers and writes a printable export plus a manifest. **It is not a Deck 001 generator.** The fixture is invented, labelled non-fabrication, and must never be printed as a Deck 001 part. See [ADR 0002](../../docs/decisions/0002-replicad-headless-generator-spike.md) and the [evidence](../../evidence/issue-9/README.md).

This package is outside the app workspace, so its engine and 23 MB WebAssembly build never reach the app bundle.

```sh
cd tools/generator-spike
npm ci
env -u NODE_ENV npm test
node src/cli.mjs --request fixtures/synthetic-plate.non-fabrication.request.json --out /tmp/spike-run
```

The command prints a JSON summary. It writes `NON-FABRICATION-synthetic-plate-r1.stl`, `NON-FABRICATION-synthetic-plate-r1.step` and `manifest.json` into a directory that must be absent or empty.

A refused or failed run exits non-zero, prints a JSON diagnostic on stderr and writes nothing:

| Exit | Meaning |
| --- | --- |
| 2 | Bad usage, an unreadable or invalid request, a refused fabrication request, or a non-empty output directory |
| 3 | Geometry refused before the kernel, or the kernel failed |
| 4 | Generated output failed verification |
| 5 | Engine or internal failure |

Non-fabrication requests carry only values with `"class": "synthetic"`. Fabrication requests are always refused here, because the only template is non-fabrication. Their inputs are still checked in full, so the refusal lists everything that would have to change: `physical-fact` inputs need `measured` or `datasheet` confidence with a durable source, and `design-parameter` inputs need an author, a rationale and an explicit test-evidence status.

Regeneration is deterministic with the pinned engine and normalized export settings described in the ADR.
