# Initial Configurator Plan

> Status: Proposed first implementation plan  
> Started: October 7, 2026  
> Goal: Place a display in a simple enclosure, save the arrangement, and generate one parameterized mounting part.

## Outcome

The first vertical slice should allow a user to open a browser application, view a simple enclosure and display, position the display, receive basic placement feedback, save and reload the arrangement, and generate a downloadable test mounting part.

This slice is intended to validate the application boundaries and development experience. It is not intended to be a sellable configurator or a general-purpose CAD editor.

## Proposed stack for the slice

- Vite, React, and TypeScript
- React Three Fiber and Drei over Three.js
- A small application-state store using plain serializable data
- GLB/glTF for viewport assets
- Replicad and OpenCascade.js in a Web Worker for the generated part
- Vitest for domain and geometry tests
- Playwright for a small number of interaction tests

The first slice does not require ASP.NET Core, PostgreSQL, authentication, cloud storage, or Shopify. Those should be introduced only after the browser prototype proves the configuration model and interaction loop.

## Working conventions to decide first

Write these decisions down before importing real assets:

- Millimeters are the canonical length unit.
- The application uses a documented right-handed coordinate system.
- Each asset declares its source units, original orientation, and normalization transform.
- Component origins have an explicit meaning rather than merely reflecting the source file.
- Three.js objects are projections of application state; they are not saved as domain state.
- Original source models remain unchanged and retain provenance and license metadata.

## Milestone 1: Application shell and representative scene

Create the React application and render:

- a ground grid and useful camera controls;
- a simple translucent enclosure represented initially by known dimensions;
- a placeholder display represented by a box with realistic dimensions;
- and basic lighting suitable for inspecting parts rather than producing marketing renders.

Use React Three Fiber for scene composition and Drei for camera controls and other well-supported helpers. Keep direct access to Three.js available for calculations and specialized rendering.

### Exit criteria

- The scene loads reliably in a development build.
- The enclosure and display are dimensionally correct in millimeters.
- Camera behavior feels appropriate for a CAD-like layout tool.
- The browser console is clean during normal interaction.

## Milestone 2: Provider-neutral configuration model

Define the smallest useful serializable model before implementing manipulation. It should include:

- a schema and schema version;
- enclosure definition and revision identifiers;
- component definition and revision identifiers;
- asset references;
- placement position and orientation;
- units and coordinate-system convention;
- and created/modified metadata useful for debugging.

Represent orientation with a normalized quaternion in saved state. The interface may expose friendly degree values, axis constraints, and preset orientations.

Create fixture definitions for the enclosure and display. Keep model URLs and rendering concerns outside the configuration record.

### Exit criteria

- A configuration can serialize to readable JSON.
- Deserializing it reproduces the same transforms within a documented tolerance.
- Domain tests do not require WebGL, React, or Three.js scene objects.

## Milestone 3: Selection and placement

Add the core editing loop:

- click to select the display;
- translate and rotate it with Drei transform controls;
- switch between translation and rotation modes;
- support local and world axes where useful;
- provide numeric position and rotation fields;
- snap translations to an adjustable millimeter increment;
- and reset the display to a known starting placement.

The scene should render from application state. During a drag, updates may be optimized locally, but completion of the interaction should commit a plain placement value to the store.

Defer scaling. Physical components should not normally be rescaled to make them fit.

### Exit criteria

- Gizmo and numeric edits remain synchronized.
- Orbit controls do not fight the transform controls.
- Selection and placement survive ordinary React rerenders.
- The stored transform contains no Three.js class instances.

## Milestone 4: Basic spatial feedback

Add feedback that is helpful without implying engineering certainty:

- enclosure interior bounds;
- component bounding box;
- one explicit display keep-out volume for cable or connector access;
- out-of-bounds detection;
- coarse overlap detection;
- and a visible list of warnings tied to the affected objects.

Start with axis-aligned or oriented bounding volumes. Do not begin with expensive triangle-level collision detection or CAD Boolean intersections.

### Exit criteria

- Moving the display outside the enclosure produces a warning immediately.
- Intersecting an explicit keep-out volume produces a distinct warning.
- Warnings clear deterministically when the placement becomes valid.
- The interface labels these results as preliminary layout checks.

## Milestone 5: Save, reload, and exchange

Support:

- automatic local persistence;
- export of the configuration as JSON;
- import of that JSON;
- and a clear reset-to-fixture action.

Validate imported data against the supported schema and report understandable errors. Do not silently accept unknown units, missing revisions, or malformed transforms.

### Exit criteria

- A configuration survives a page reload.
- An exported configuration can be imported into a clean browser session.
- The resulting arrangement matches the original.
- Invalid input fails without corrupting the last valid configuration.

## Milestone 6: Replace placeholders with measured assets

Measure and photograph the physical display when practical. Obtain or create a representative source model and record:

- overall dimensions;
- active screen area and bezel;
- mounting-hole locations;
- connector locations;
- cable approach and bend clearances;
- source, author, license, and revision;
- and confidence in each measurement.

Convert or derive an optimized GLB for the viewport while preserving the original asset. Normalize units, orientation, and origin through recorded metadata rather than destructively altering the source without a trace.

The enclosure can remain a synthetic open box for this slice. A real case becomes valuable once one is selected and measurable.

### Exit criteria

- The placeholder display can be swapped for its GLB without changing saved placement semantics.
- Mounting points, connector locations, and keep-outs align with the visible model.
- The asset provenance and normalization transform are inspectable.

## Milestone 7: Replicad/WebAssembly generation spike

Run Replicad and OpenCascade.js in a dedicated Web Worker. Define one generated part, preferably a display mounting plate or simple bezel, using explicit inputs such as:

- display width and height;
- plate thickness;
- edge clearance;
- mounting-hole positions and diameters;
- bezel overlap;
- and corner radius.

Return from the worker:

- a tessellated preview mesh for the Three.js scene;
- STL output;
- STEP output if supported by the chosen workflow;
- calculated bounds;
- generator, template, and engine versions;
- and diagnostics.

The generator input must be derived from domain values, not from Three.js object references. Debounce regeneration while parameters are being edited and provide visible busy, success, and failure states.

### Exit criteria

- A parameter change regenerates the preview without freezing the interface.
- The same inputs produce equivalent output across repeated runs.
- The generated part can be downloaded and opened in an external tool.
- Generation failure leaves the last valid result visible and reports a useful diagnostic.
- The manifest is sufficient to reproduce the part later.

## Milestone 8: Review the experiment

Before adding a backend or more components, record what the slice taught us:

- Did React Three Fiber and Drei simplify the interaction model?
- Is the configuration model independent enough from the renderer?
- Is Replicad's API expressive enough for the intended part families?
- Is OpenCascade.js acceptable in download size, startup time, memory, and diagnostics?
- Should generation remain in the browser, move to a server worker, or support both?
- Which display metadata was actually required?
- Which apparent validation rules were too uncertain to automate?
- What is the next smallest part family or component type?

Turn answers into architecture decisions, data-model changes, and a revised next milestone rather than expanding the prototype automatically.

## Suggested implementation order

Keep each step independently demonstrable:

1. Static enclosure and display scene.
2. Serializable configuration fixture.
3. Selection and transform controls.
4. Numeric editing and snapping.
5. Bounds and keep-out warnings.
6. Save, reload, import, and export.
7. Measured display asset and metadata.
8. Worker-hosted Replicad generator.
9. Downloadable preview, STL, STEP, and reproduction manifest.
10. Architecture review and next-slice decision.

## Explicitly deferred

- User accounts and shared projects
- Database and cloud object storage
- Shopify integration
- Community uploads
- Automatic feature recognition
- Arbitrary enclosure editing
- Cable routing and thermal simulation
- Full undo/redo history beyond what is needed to evaluate the editing experience
- Mobile and touch-first interaction
- Production security and sandboxing for untrusted model uploads
- Multiple geometry providers
