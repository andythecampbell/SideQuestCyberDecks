# Configuration snapshots

Committed configuration snapshots. `npm test` validates every file here against the real catalog and resolves each one in every supported pose, the same way the catalog is validated.

> **Status: accepted location.** Andy accepted `snapshots/` as the default repository snapshot path in PR #11.

## Rules

- Each snapshot is the exact canonical bytes the app exports (schema version 2). Hand-formatted or unmigrated files are rejected by `npm test`.
- `index.json` lists every snapshot with a label. A snapshot without a label, or a label without a snapshot, fails `npm test`.
- Labels are deliberately strict. `status` is `illustrative`, `calibration` is `uncalibrated`, and `authoritative` and `asBuilt` are `false`. A stronger claim needs a schema change and the physical evidence that supports it.
- A snapshot's file name must include its status.
- Every display a snapshot references is listed under `unverifiedIdentities` until a measurement record confirms its identity and spelling.

## Canonical bytes

`serializeSnapshot` in `app/src/domain/snapshot.ts` defines the format: UTF-8, LF line endings, one trailing newline, two-space indentation, object keys sorted by UTF-16 code unit, number arrays on one line, and numbers in shortest round-trip form with signed zero preserved. Importing a canonical export and exporting again is byte-identical. A differently formatted v2 file, or a migrated v1 file, keeps the same design but is canonicalized on its first export.

## What a snapshot is not

A snapshot records a configuration. It is not a description of a physical deck. No snapshot here claims fit, clearance, wiring, connector access, cooling or assembly, and none is a source for generated parts. See the [Deck 001 alpha roadmap](../docs/DECK_001_ALPHA_ROADMAP.md) and [measurement records](../evidence/measurements/README.md).

## Current contents

- `deck-001-illustrative.json`: the app's illustrative fixture, exported canonically. Uncalibrated and not as-built.

## Product identity and later physical evidence

Andy confirmed the display spelling as `hosyond-7in-touch` / Hosyond in PR #11. The immutable CAD source remains `assets/Hosyond 7in IPS LCD.step`. Mounting-hole and connector positions remain estimates or unresolved; Andy will update them as physical evidence becomes available. Those later measurements do not block this illustrative, uncalibrated snapshot.
