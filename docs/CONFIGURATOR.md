# SideQuest Decks: Configurator Direction

> Status: Exploratory architecture sketch  
> Started: October 7, 2026  
> Purpose: Define a useful first slice of the configurator without prematurely choosing a permanent CAD engine.

The actionable implementation sequence for the first enclosure-and-display slice is maintained in [Initial Configurator Plan](./INITIAL_CONFIGURATOR_PLAN.md).

## Decision summary

Build the first configurator as a browser application with distinct layers for product data, scene interaction, geometric computation, and fulfillment.

The recommended starting stack is:

- React and TypeScript for the browser application;
- React Three Fiber, Three.js, and Drei for the three-dimensional viewport and manipulation tools;
- ASP.NET Core for the application API and later Shopify integration;
- PostgreSQL for versioned component, enclosure, and configuration records;
- object storage for source models and derived artifacts;
- and a replaceable geometry-engine boundary, initially exercised with small Zoo/KCL and Replicad/OpenCascade.js experiments.

React is recommended here because React Three Fiber and Drei provide a particularly useful interaction ecosystem, not because React is inherently a better application framework than Angular. Angular with direct Three.js integration remains viable. If learning React begins to slow delivery materially, retaining Angular and keeping the same system boundaries is a reasonable alternative.

Do not make Zoo, a CAD kernel, Shopify, or even the three-dimensional scene graph the source of truth for a configuration. The durable source of truth should be SideQuest's versioned domain model.

### Current geometry hypothesis

Replicad/OpenCascade.js is the leading candidate for the first geometry experiment because it can run locally, fits the TypeScript application environment, supports exact solid geometry and STEP workflows, and is compatible with the goal of an open-source application that can be self-hosted. This is a hypothesis to test, not yet a production decision.

Zoo/KCL remains an interesting optional provider and comparison point. Zoo is a company and ecosystem worth following, and KCL may prove valuable for readable, versioned generators or hosted automation. The project should adopt it where it creates clear leverage rather than making support for Zoo an objective by itself.

## What the first configurator is

The first useful version is an assembly layout tool, not a general-purpose CAD system.

It should allow a user to:

1. Open a known enclosure.
2. Add a known component such as the first display.
3. Select, translate, rotate, and remove the component.
4. See dimensions, mounting references, and obvious collisions or boundary violations.
5. Save and reopen the configuration.
6. Export a configuration manifest that completely describes the arrangement.

The first generated part should be one deliberately narrow family such as a rectangular display bezel, a mounting tray, or a standoff plate. It should be generated from explicit parameters rather than inferred from arbitrary geometry.

## What Three.js does

Three.js is the rendering and interaction layer. It is a good fit for:

- drawing tessellated component and enclosure models;
- cameras, lighting, grids, clipping, transparency, and exploded views;
- ray casting and object selection;
- translate and rotate gizmos;
- snapping and placement feedback;
- bounding-box and approximate mesh collision feedback;
- and rendering GLB/glTF, STL, and other display-oriented assets.

React Three Fiber exposes Three.js through React's component model. Drei supplies useful controls and helpers, including camera, drag, and transform controls.

Three.js is not a precision solid-modeling kernel. It should not be responsible for reliable fillets, shells, offsets, exact Boolean operations, STEP topology, or the final manufacturing definition of generated parts.

## What a geometry engine does

A geometry engine accepts a versioned template and parameters and returns manufacturing and preview artifacts. It may also measure or interrogate imported solid geometry.

The application should define a provider-neutral contract resembling:

```text
generate(templateRevision, parameters)
  -> preview mesh
  -> manufacturing files
  -> measurements
  -> warnings and diagnostics
  -> engine and generator versions
```

Generation should be deterministic and asynchronous. Every output should be traceable to the input configuration, template revision, engine version, unit system, tolerance policy, and export settings.

### Zoo and KCL

Zoo is attractive because KCL represents parametric CAD as readable, versionable source code and Zoo provides APIs for modeling, file conversion, and export. A SideQuest generator could render a KCL template from typed parameters and submit it through Zoo's TypeScript client or web-view integration.

Zoo is not required for the layout editor. Its hosted modeling engine introduces authentication, network availability, usage cost, and service dependency. Public browser clients must not contain a permanent SideQuest API token. The current public viewer documentation also indicates that general developer OAuth is not yet the default integration path, so a production integration needs deliberate server-side credential and session design.

Treat Zoo as a serious candidate and a useful experiment, not as an irreversible platform decision. Keep KCL templates in source control if the experiment is successful, and isolate all Zoo calls behind the geometry provider boundary.

### Replicad and OpenCascade.js

Replicad provides a higher-level JavaScript interface over OpenCascade.js. It can run an OpenCascade solid-modeling kernel through WebAssembly, import STL and STEP, export STL and STEP, and provide display meshes to Three.js. Geometry work should run in a Web Worker so it does not block the interface.

This route better supports an entirely self-hosted open-source application and keeps exact B-rep operations available, but it places more CAD integration, WASM packaging, performance, and reliability work on the SideQuest project.

### JSCAD and Manifold

JSCAD is an approachable, MIT-licensed JavaScript system for browser and command-line parametric models. It is especially well aligned with simple printable parts and fast experimentation, but it is more mesh/CSG oriented than an exact STEP-centered workflow.

Manifold is a robust, Apache-licensed solid mesh Boolean library with TypeScript/WebAssembly support. It is valuable when the desired product is a dependable manifold mesh or 3MF rather than editable B-rep CAD.

These are good tools for printable generators, but neither should be mistaken for the viewport or the configuration data model.

## Proposed system boundaries

```text
Browser application
  React UI
  Configuration editor
  React Three Fiber / Three.js viewport
  Local interaction and coarse validation
            |
            | versioned commands and snapshots
            v
ASP.NET Core application API
  Catalog and configuration domain
  Validation and trust workflow
  Upload and artifact orchestration
  Shopify handoff
            |
            +--------------------------+
            |                          |
            v                          v
PostgreSQL and object storage     Geometry job boundary
  Records and metadata             Zoo/KCL provider
  Original uploads                 Replicad/OCCT provider
  GLB preview assets               Future providers
  STEP/STL/3MF outputs
```

Start as a modular monolith. Separate processes are justified for untrusted file processing and resource-intensive geometry jobs, but the product does not need a microservice architecture.

## Geometry and file pipeline

Keep the uploaded source file unchanged. Derive purpose-specific artifacts instead of forcing one format to do every job.

- Source asset: the original STEP, STL, 3MF, OBJ, or other accepted file.
- View asset: normally GLB/glTF, tessellated and optimized for browser rendering.
- Engineering asset: STEP or another solid representation when one exists.
- Manufacturing asset: STL or 3MF generated with recorded tolerances and export settings.
- Definition metadata: units, coordinate system, origin, mounting interfaces, ports, keep-outs, clearances, license, provenance, and validation state.

An STL is fully useful as a source or manufacturing artifact, but it does not automatically become an editable parametric component. A STEP model is richer geometry, but it still does not identify the semantic meaning of every face, connector, mounting hole, or clearance. Those facts belong in the component definition.

## Core domain concepts

The first domain model should distinguish:

- `ComponentDefinition`: the identity and stable meaning of a component;
- `ComponentRevision`: dimensions, interfaces, constraints, models, and evidence for a particular revision;
- `EnclosureDefinition` and `EnclosureRevision`: enclosure-specific equivalents;
- `Asset`: an immutable uploaded or generated file with provenance and license metadata;
- `Interface`: mounting pattern, port, electrical connector, airflow area, or other connection point;
- `KeepOutVolume`: required empty space for cables, cooling, access, or motion;
- `Placement`: a component revision plus a transform in an enclosure coordinate system;
- `ConfigurationRevision`: an immutable snapshot of selections, placements, rules, and results;
- `GeneratedPart`: an artifact produced by a generator and tied to exact inputs;
- `ValidationResult`: a rule outcome with severity, evidence, and ruleset version;
- and `Qualification`: unverified, community-tested, or SideQuest-qualified status with supporting evidence.

Use millimeters as the canonical stored length unit and explicit right-handed coordinate-system conventions. Imports must record their detected or declared units rather than silently guessing.

## Architecture rules

- The domain configuration must serialize without Three.js objects, KCL source, or OpenCascade handles.
- Store transforms as explicit numeric data with a documented coordinate convention.
- Generated geometry is derived and reproducible; it is not the only record of design intent.
- Imported files are untrusted and should be size-limited, scanned, parsed in isolation, and never executed as arbitrary contributed code.
- Browser validation may provide immediate feedback, but server-side validation decides whether a configuration can be ordered or qualified.
- A valid geometric arrangement does not imply electrical, thermal, radio, or manufacturing safety.
- Shopify receives a frozen configuration revision and priced fulfillment choices. It does not own the engineering configuration.

## First technical spikes

### Spike A: layout editor

- React, TypeScript, Vite, React Three Fiber, and Drei.
- Load one enclosure and one display as GLB or STL preview assets.
- Select the display and manipulate it with translate and rotate controls.
- Persist a provider-neutral JSON configuration locally.
- Show enclosure bounds and one explicit keep-out volume.

This spike requires no CAD engine and should be completed first.

### Spike B: first generated part with Replicad

Define a small display bezel or mounting plate using named inputs and implement it in Replicad/OpenCascade.js. Verify:

- implementation clarity;
- browser and server integration effort;
- deterministic STL, 3MF, and STEP output;
- accuracy and robustness of Boolean, fillet, offset, and shell operations;
- latency and resource usage;
- licensing and self-hosting;
- diagnostics and failure recovery;
- and ease of contribution by the intended community.

If the Replicad experiment exposes important limitations, or when a hosted geometry workflow becomes valuable, implement the same generator in KCL/Zoo and compare output quality, development effort, authentication, latency, and operating cost. More than one provider may ultimately remain useful.

### Spike C: component authoring

Create a form for attaching a preview asset and recording dimensions, mounting points, connectors, keep-outs, units, provenance, and license. The first version should use explicit numeric entry and viewport picking, not automatic feature recognition.

## Near-term non-goals

- A complete browser CAD application
- Automatic recognition of every feature in an arbitrary enclosure
- Automatic cable routing or thermal simulation
- Editing arbitrary STEP topology in the layout viewport
- Treating mesh collision as proof of manufacturability
- Directly executing arbitrary user-contributed generator code
- Microservices, event sourcing, or a generalized plugin marketplace
- Tight Shopify coupling before configurations are stable and versioned

## Questions to answer with prototypes

- Does React Three Fiber materially accelerate selection, transform controls, overlays, and state synchronization for this team?
- Can the chosen viewport remain responsive with realistic enclosure and component meshes?
- What minimum component metadata makes placement and bracket generation useful?
- Can Zoo credentials and usage be mediated in a way compatible with a public hosted application?
- Does Zoo's hosted workflow provide enough leverage to justify the dependency and operating cost?
- Is Replicad/OpenCascade.js reliable and supportable enough for the initial generator families?
- Should generation happen in the browser, in a sandboxed worker service, or both?
- Which outputs are required for the first fabrication workflow: STL, 3MF, STEP, or a subset?

## Primary technical references

- [Zoo KCL documentation](https://docs.zoo.dev/docs/kcl)
- [Zoo API overview](https://docs.zoo.dev/docs/developer-tools/api)
- [Zoo web-view repository](https://github.com/KittyCAD/web-view)
- [React Three Fiber introduction](https://r3f.docs.pmnd.rs/getting-started/introduction)
- [Drei controls](https://drei.docs.pmnd.rs/controls/introduction)
- [Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html)
- [Replicad library integration](https://replicad.pages.dev/docs/use-as-a-library/)
- [OpenCascade.js](https://ocjs.org/)
- [JSCAD documentation](https://jscad.app/docs/)
- [Manifold WebAssembly API](https://manifoldcad.org/docs/jsapi/)
