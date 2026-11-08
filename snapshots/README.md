# Configuration snapshots

Committed configuration snapshots. `npm test` validates every file here against the real catalog and resolves each one in every supported pose, the same way the catalog is validated.

> **Status: provisional location.** Andy's decision on where repository snapshots live (issue #7) is still open. This directory was chosen so the first snapshot can exist and be validated; moving it is a one-line test change. The display catalog id spelling is likewise an open decision, recorded below.

## Rules

- Each snapshot is the exact canonical bytes the app exports (schema version 2). Hand-formatted or unmigrated files are rejected by `npm test`.
- `index.json` lists every snapshot with a label. A snapshot without a label, or a label without a snapshot, fails `npm test`.
- Labels are deliberately strict. `status` is `illustrative`, `calibration` is `uncalibrated`, and `authoritative` and `asBuilt` are `false`. A stronger claim needs a schema change and the physical evidence that supports it.
- A snapshot's file name must include its status.
- Every display a snapshot references is listed under `unverifiedIdentities` until a measurement record confirms its identity and spelling.

## What a snapshot is not

A snapshot records a configuration. It is not a description of a physical deck. No snapshot here claims fit, clearance, wiring, connector access, cooling or assembly, and none is a source for generated parts. See the [Deck 001 alpha roadmap](../docs/DECK_001_ALPHA_ROADMAP.md) and [measurement records](../evidence/measurements/README.md).

## Current contents

- `deck-001-illustrative.json`: the app's illustrative fixture, exported canonically. Uncalibrated and not as-built.

## Open decisions

- **Snapshot location.** Provisional; see above.
- **Display identity and spelling.** The catalog says `hoysond-7in-touch` / Hoysond; the preview CAD source file is named `Hosyond 7in IPS LCD`. No physical evidence confirms either yet. `hoysond-7in-touch@1` is referenced only because it is the existing catalog id; the `unverifiedIdentities` entry says so explicitly. A correction would be a new catalog id or revision and a new snapshot, which is why it is cheaper to decide early.
