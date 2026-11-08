# Deck 001 Alpha Roadmap

> Status: Current plan for the first product milestone. Started 2026-11-06 from merged `main` at `a2071b69`.
> Supersedes the milestone sequence in [INITIAL_CONFIGURATOR_PLAN.md](./INITIAL_CONFIGURATOR_PLAN.md), which is now historical.
> Units, axes, origins and confidence levels: [CONVENTIONS.md](./CONVENTIONS.md). Direction and decisions: [VISION.md](./VISION.md#decisions-and-changes).

## Milestone

**Deck 001 alpha: a physical Deck 001, represented by a versioned configuration, with at least one installed part that was generated reproducibly.**

Two things are kept separate so neither is claimed by the other:

- **Working deck.** The assembled Deck 001 runs and is used. Its parts may be generated or drawn by hand.
- **Generated-part claim.** At least one installed part came from the generator and can be regenerated from recorded inputs.

If the generator can't produce an installable part, the deck may still be finished with hand-drawn parts. The milestone is then **not** met, and the reason becomes a learning item.

### Exit criteria

1. A Deck 001 configuration snapshot is committed. It imports without errors, resolves in every supported pose, and describes the deck as built. Its placements are still body-local and uncalibrated.
2. From a clean checkout, the recorded generator request reproduces the recorded artifact, and the hashes match. Every consumed physical fact is `datasheet` or `measured` and cites its source. Every design or process parameter is explicitly classified as a chosen parameter, records its value, author, rationale, and—where applicable—coupon or test evidence. No physical fact used as an input is an `estimate`.
3. That artifact was printed and installed in the actual Deck 001 as generated. A hand-modified generated part doesn't count for that iteration. The modification is recorded.
4. The deck passes a functional test list that Andy writes **before** the first print. Pass criteria are set there, not in this roadmap.
5. A validation record links configuration → request → artifact → print → installation → test results. Every intervention in it is classified and has a disposition.

## Starting point

The merged preview provides:

- a strict v2 configuration with body-local placements attached to `base` or `lid`;
- a pure resolver that composes world transforms for a pose given as an argument;
- an articulated two-body preview of the 2800 case with OPEN/CLOSED inspection;
- a read-only fixture with illustrative placements.

It does **not** provide:

- editing or persistence;
- calibrated hinge values (`calibration` is `UNRESOLVED`);
- cleared rights for the derived meshes;
- any measured Deck 001 dimension.

Every display value in the catalog is an `estimate`. Nothing physical can be generated from today's data. That is why measurement starts immediately and runs alongside the software work.

## Two linked tracks

| Software / configurator | Physical evidence / fabrication |
|---|---|
| S1 Preview closeout | P1 Measurement and discovery |
| S2 Body-local placement editing | P2 Physical build |
| S3 Configuration snapshots | |
| S4 Bounded generator spike | |
| S5 First generated part from measured inputs (link point) | |
| L Evidence-driven learning (closes both tracks) | |

The two tracks meet at three points:

- **S5 needs P1.** The first real generator run consumes only measured or datasheet values for the features the part actually uses.
- **P2 needs S3 and S5.** The build installs a recorded artifact, and the deck's state is captured as a snapshot.
- **L needs P2.** Changes to schemas, generator logic, or rules come only from recorded physical results.

```
S1 ─► S2 ─► S3 ───────────────────────────┐
S4 (synthetic inputs; parallel with S2/S3) ┼─► S5 ─► P2 ─► L
P1 (starts now; no software dependency) ───┘
```

The calendar critical path is likely P1 → S5 → print and fit iterations, not software. At most two implementation PRs should be in flight at once, so independent review stays tractable.

## Software track

### S1 Preview closeout

Record what the merged preview is and isn't, so later slices don't depend on unresolved values.

- Record Andy's disposition of issue #2: is the provisional preview delivered, and where does calibration go?
- Make the evidence index accurate for merged `main`. Restore or remove the links to files that aren't in the repository.
- Record the open QA follow-ups: stable mesh/list selection and camera framing. Selection sync is fixed in S2.
- Out of scope: resolving calibration, rights or orientation. Code changes.

### S2 Body-local placement editing

Andy selects a placed component and edits its body-local position (mm) and orientation numerically. Orientation is stored as a unit quaternion. Lid-attached parts follow the lid between poses, base-attached parts stay put, and the stored values are the same in every pose.

- **Edits are body-local.** An edit is a pure domain operation over the configuration. It is re-validated, and if rejected it leaves the previous configuration untouched. The pose is UI state. It is never written into the configuration, and it never changes timestamps.
- **Minimum transparency.** For the selected placement, the UI shows:
  - the component `id@revision`;
  - its attachment body;
  - the exact stored position and quaternion;
  - which of the component's catalog features are `estimate`;
  - the enclosure's `UNRESOLVED` calibration status.

  Nothing more is required.
- **Persistent no-fit warning.** One tested constant, always visible, not dismissible. It is shown with or without a selection and in every pose. It says that fit, clearance, wiring, connector access, cooling and assembly are unvalidated, and that on-screen appearance, mesh bounds and apparent overlap are not evidence. No UI text claims that anything fits or clears.
- **Out of scope:** automated interference, bounds or keep-out checks; a gizmo; re-parenting between bodies; editing the base or the enclosure; undo history; snapping; adding or removing components; persistence (S3).
- **Possible follow-up:** shell translucency as a viewing aid, split out only if inspection in the CLOSED pose proves inadequate.

### S3 Configuration snapshots

Edits survive reload. A configuration can be exported and imported as a file. A Deck 001 snapshot can be committed to the repository and validated by `npm test`, the same way the catalog is.

- **Import is an untrusted boundary.** Reject unknown or missing schema versions. Never guess units. Never upgrade a catalog revision silently. Resolve in every supported pose as a semantic check. A rejected file changes nothing.
- **Viewing doesn't modify.** Changing pose or selection writes nothing. Importing preserves the file's timestamps. Only a real edit changes `modifiedAt`.
- **Export is canonical.** Once accepted, exporting a configuration produces canonical bytes. Re-importing that canonical export and exporting again is byte-identical. A migrated v1 file or differently formatted v2 file must preserve the same design semantics, but its first canonical export is not expected to match the source bytes. Frozen fixtures keep every supported version importable.
- **Decide before the first committed snapshot:** where repository snapshots live, and whether the display's catalog id spelling is correct. Ids are referenced from snapshots, so a later rename gets more expensive.
- **Out of scope:** backend, accounts, sharing, multiple saved projects, merge UI, putting fabrication data inside the configuration.

### S4 Bounded generator spike (one engine)

Answer one question: can a single engine produce a printable, deterministic part from explicit numeric inputs, with recorded versions?

- **One engine.** Start with the leading hypothesis in [CONFIGURATOR.md](./CONFIGURATOR.md), Replicad/OpenCascade.js. Evaluate a second engine only if this one fails a must-have, such as determinism, a printable export, or acceptable packaging. Zoo/KCL stays out unless that fallback is warranted too.
- **Synthetic inputs only.** Inputs are labelled as non-fabrication and deliberately unlike Deck 001. Spike output is never printed as a Deck 001 part.
- **Time-boxed.** The box is set when the spike starts. The result is a short ADR: keep, fall back, or stop. Where generation runs (headless or in the browser) is part of that ADR. A headless run is enough for this milestone.
- **Out of scope:** browser UI integration, a parameter UI, a part-family library, a multi-engine abstraction.

### S5 First generated part from measured inputs

S5 turns a recorded request into the first real artifact, using the engine kept by S4 and the facts from P1.

- **Part family and assembly architecture.** Chosen at gate G3, after measurement. This roadmap doesn't pre-select them.
- **The generator refuses unless every consumed input qualifies.** Each consumed physical fact must be `datasheet` or `measured` with a cited source. Each chosen design or process parameter must be explicitly identified and record its value, author, rationale, and any applicable coupon or test evidence.
- **What never becomes an input:**
  - preview meshes and mesh bounds;
  - viewport positions;
  - illustrative fixture placements;
  - unresolved hinge values;
  - catalog `estimate` values.
- **A minimal manifest beside the artifact records:**
  - the inputs, each with its confidence and source;
  - the generator, template and engine versions;
  - the export settings;
  - the output hashes.

  That's enough to regenerate the artifact and compare hashes. It isn't a general provenance system.
- **Changing an input means a new request and artifact.** A recorded hash is never edited by hand.

## Physical track

### P1 Measurement and discovery

Establish the facts the first generated part needs, and discover what isn't known yet. Records use the template in [evidence/measurements/README.md](../evidence/measurements/README.md).

- **Identify the parts.** Record the identity of each physical part: display, case, Pi, keyboard, power bank, fasteners. Take photos of labels and markings. Don't assume a part matches its catalog entry or preview mesh.
- **Measure only what is consumed.** Measure only the features the candidate part families would use. Absence is a result: "no mounting holes found" is recorded like any measurement.
- **Discover process behaviour.** Record the printer, material and slicer facts, and how they behave dimensionally, through declared test prints.
- **Promote by new revision.** A catalog value is promoted only through a new catalog revision whose sources cite a measurement record. The old revision is kept.
- **Out of scope:** measuring features no candidate part consumes; deriving anything from meshes.

### P2 Physical build

Print, install, test and iterate until the exit criteria are met or the iteration budget (G5) runs out.

- **One record per iteration.** Each print iteration gets its own validation record: which artifact, print settings, hardware, installation steps, photos, test results, and interventions. Every intervention is written down, including "none".
- **Hand-drawn parts are welcome.** Trays, retention and the like count as first-class evidence when logged the same way. They don't count toward the generated-part claim.
- **Case modifications are pre-declared** at G2 and recorded.
- **The as-built snapshot distinguishes evidence from intent.** Component identities, body attachments, and recorded installed transforms describe what was built when they are supported by the validation record. Unresolved enclosure calibration and any illustrative placement remain explicitly labelled and are not presented as measured as-built facts.

### L Evidence-driven learning

Classify each intervention by the layer it implicates:

- measurement or data;
- generator logic;
- print process;
- case variation;
- assembly;
- documentation.

Give each physically observed intervention a disposition: fix now, schema change, rule candidate, defer, or won't fix. Product or fabrication changes justified by physical validation cite the relevant recorded intervention. This requirement does not apply to ordinary software defects, maintenance, or independently justified product decisions. Any change that affects fit-relevant output is revalidated physically, or explicitly labelled "not revalidated". Then propose the next milestone.

## Decision gates (Andy)

| Gate | Decision | Needed before |
|---|---|---|
| G1 | Disposition of issue #2; whether any hinge or calibration value will be consumed by fabrication (expected: no) | S5 request |
| G2 | Case identity; display location (lid or base); which case modifications are allowed | Lid/base measurements in P1; G3 |
| G3 | Part family and assembly architecture, chosen from measured answers | S5 request |
| G4 | Spike outcome: keep the engine, fall back, or stop | S5 implementation |
| G5 | Functional test list, pass criteria, iteration budget; whether process test prints may use declared test dimensions | First print |
| G6 | Reported-value rule and when to remeasure | First measurement record consumed by S5 |
| G7 | Rights for derived meshes and the license for generated hardware files | Publishing any derived or generated file |

None of these values is set here. Each gate is recorded in [VISION.md](./VISION.md#decisions-and-changes) or an ADR when it is made.

## Claims boundary

**The alpha may claim** that this printed part, installed in this Deck 001 with this display unit, case unit and hardware, passed the tests Andy wrote beforehand, under the recorded conditions.

**It does not claim:**

- fit for other units, batches, prints or materials;
- durability, thermal, drop, vibration or ingress performance;
- electrical or regulatory safety;
- battery runtime;
- that another builder can reproduce it;
- calibration of the preview hinge;
- that any configurator layout fits.

A layout that looks right in the viewport proves nothing. One build earns no community-tested or SideQuest-qualified status.

## Deferred

- **Automated interference, bounds and keep-out detection.** Deferred until physical results show which checks can be trusted. If one is added later, label it a preliminary layout check, not a fit claim.
- **Further deferrals:**
  - a gizmo editor;
  - browser-side generation;
  - a second engine (unless S4 fails);
  - a general enclosure model;
  - a provenance inspection system beyond S2's minimum;
  - catalog contribution tooling;
  - backend, database, accounts and store integration.

## Every PR

- `npm test` and `npm run build` pass.
- `app/src/domain/` stays free of React, Three.js and DOM imports.
- Conventions are unchanged unless the PR changes them deliberately.
- No new path lets an `estimate` value reach generated geometry.
- No agent records a physical result it did not observe. Physical checks are completed by Andy, with evidence.
