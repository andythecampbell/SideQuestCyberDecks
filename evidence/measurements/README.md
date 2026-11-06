# Measurement records

This folder holds physical measurement records for Deck 001 and later builds. It is part of P1 in the [Deck 001 alpha roadmap](../../docs/DECK_001_ALPHA_ROADMAP.md). Units, axes and confidence levels follow [CONVENTIONS.md](../../docs/CONVENTIONS.md).

A catalog value becomes `measured` only when a record here supports it. The value is promoted through a new catalog revision whose `sources` cite the record. The old revision is kept.

## Hard rule

**Nothing may drive a generated part unless it comes from a measurement record here or from a cited `datasheet` source.** The following are never measurement sources:

- catalog `estimate` values;
- viewport or on-screen positions;
- preview mesh geometry or mesh bounds;
- illustrative fixture placements;
- unresolved hinge or calibration values.

Copying one of these into a record does not make it `measured`.

## Files

- Name each record `<subject>-<feature>-<YYYY-MM-DD>.md`. Example: `display-outline-2026-11-10.md`.
- Put its photos and scans in a folder with the same name.
- Records are append-only once a catalog revision cites them. To correct one, add a new record and note in it which record it supersedes.

## Record template

Copy this block into a new file and fill in every field. Write `n/a` or `unknown` rather than leaving a field blank.

```markdown
# <Record title>

- Record id: <file name without .md>
- Date / measured by:
- Subject: <catalog id@revision, or "case", "print process", "hardware">
- Unit identity: <listing/SKU, label text, serial or markings; photo refs>
- Feature: <what is measured; catalog field path if one exists>
- Purpose: <which part or decision consumes this, if known>

## Datum and method

- Datum: <origin feature and axis directions on the physical part; photo ref>
- Mapping to conventions: <how the datum relates to the component's min-corner, +X/+Y/+Z frame>
- Units: mm (or state otherwise; never mix)
- Instrument: <kind, make/model, resolution; zero check done? y/n>
- Method: <steps, written so someone else could repeat them>
- Conditions: <e.g. protective film on/off, display powered, cable inserted, temperature if relevant>

## Raw readings

Record every reading in the order it was taken. Do not discard any. If one is
excluded from the reported value, keep it in this table and give the reason.

| # | Reading | Location / position on part | Note |
|---|---|---|---|
| 1 | | | |
| 2 | | | |
| 3 | | | |

## Reported value

- Rule: <the reported-value rule, stated before measuring; per roadmap gate G6>
- Reported value: <result of applying the rule to the readings above>
- Spread: <max - min of included readings>
- Remeasure needed? <per the rule chosen at G6; do not invent a threshold here>

## Evidence

- Photos/scans: <files, each showing a scale reference where dimensions matter>
- Other: <datasheet cross-check, listing image (cross-check only, not a source)>

## Observations

<Non-dimensional facts: features found or confirmed absent, fragility, surprises.
"None found" is a result and belongs here.>
```

## Notes

- **Absence is data.** If a feature is checked and isn't there, record that. Missing mounting holes are an example.
- **Seller listings and images are cross-checks only.** They are not a `datasheet` source. A manufacturer document, identified by id, version or file hash, is.
- **Process test prints declare their own test dimensions and are never installed.** How they relate to the estimate rule is decided at roadmap gate G5. Record their results here like any other measurement.
- **A thread is not identified by engagement alone.** Record the fastener specification from an authoritative source or verify it with an appropriate gauge and multiple known fasteners, including engagement depth and fit. A single screw merely entering a feature is only an observation, not a thread specification.
