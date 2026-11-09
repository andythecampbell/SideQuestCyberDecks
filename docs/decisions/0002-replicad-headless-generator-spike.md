# 0002: Replicad/OpenCascade.js headless generator spike

Status: **Proposed**. Decision owner: Andy, who has not yet accepted or challenged this record. Tracks issue #9. Evidence: [evidence/issue-9](../../evidence/issue-9/README.md).

## Decision

**Keep** Replicad/OpenCascade.js for headless generation in the next slice. No must-have failed, so no second engine was evaluated.

The spike answers one question: can one engine produce a printable, deterministic part from explicit numeric inputs with recorded versions? On the tested setup, yes. The answer is scoped to what was tested:

- **Where generation runs:** headless Node, as the separately pinned `tools/generator-spike` package outside the app workspace. Browser or Worker execution was out of scope and is not assessed here.
- **Time box:** one focused implementation cycle, capped at one working day or one draft PR, as set by the foreman kickoff on issue #9.
- **Fixture:** one synthetic plate with a through-cut, pocket, three holes and rounded corners. Its values are invented and share no number with the catalog, snapshots or preview manifest. It proves the pipeline, not a Deck 001 part, and must never be printed as one.
- **Not a production endorsement.** Part-family choice, real inputs and the first installed part remain roadmap S5, after measurement.

## Must-haves

| Must-have | Result | Evidence |
| --- | --- | --- |
| Repeated runs give byte-identical primary output | **Pass.** Two clean processes match on STL, STEP and manifest. A kernel reused in one process also matches. A second Node release (24.22.2 vs 22.22.0) writes identical STL and STEP bytes, and the manifest differs only in the recorded runtime. | [12](../../evidence/issue-9/12-two-clean-runs.log), [15](../../evidence/issue-9/15-cross-runtime.log) |
| Export opens in an external tool with correct units | **Automated checks pass; Andy's interactive CAD or slicer check is pending** (see the PR). trimesh and ADMesh read the STL as one closed body at the requested size. A native OpenCascade build reads the STEP as one valid closed solid declaring millimetres. | [14](../../evidence/issue-9/14-external-validation.log) |
| Packaging, install and runtime cost acceptable | **Pass for headless use.** Numbers below. | [11](../../evidence/issue-9/11-packaging.log), [16](../../evidence/issue-9/16-kernel-reuse.log) |
| Failures produce a useful diagnostic | **Pass.** Every refusal or failure exits non-zero with a stage, a code and a per-input path, and writes nothing. Kernel exceptions are decoded to their OpenCascade type and message. The first implementation only reported `[object WebAssembly.Exception]`, which a test now rejects. | [10](../../evidence/issue-9/10-kernel-diagnostic.red.log), tool suite |
| License compatible with the MIT app | **Pass for headless use.** Browser distribution has further obligations; see License. | [License](#license) |

## Acceptance results

Generated from `tools/generator-spike/fixtures/synthetic-plate.non-fabrication.request.json` at the recorded versions.

| Output | SHA-256 | Bytes |
| --- | --- | --- |
| `NON-FABRICATION-synthetic-plate-r1.stl` | `9cc920c3b06715e03bed96330d2a5f0cb38a2a012f44601a37b70e11cb44edfd` | 104284 |
| `NON-FABRICATION-synthetic-plate-r1.step` | `45d7e374f5caeaaa69a08aa484debccd7ed2b72ccd785bdd372a3b6a521a8552` | 73773 |

- **Dimensions:** 73.5 × 41.25 × 6.125 mm, equal to the explicit inputs (`max - min` per axis, exact in the B-rep, the STL and the re-imported STEP).
- **Solid count:** one. STEP carries one `MANIFOLD_SOLID_BREP`, one `CLOSED_SHELL` and no `OPEN_SHELL`. The STL is one closed, consistently oriented body of genus 4 (the through-cut and three holes), Euler characteristic −6.
- **Volume:** B-rep 17299.0599 mm³ against the analytic 17299.0599 mm³. Each operation's volume change is checked separately against its analytic value.
- **Units:** STEP declares `SI_UNIT(.MILLI.,.METRE.)`. Binary STL has no unit field; its coordinates are millimetres by the manifest and the project convention, and the file header says so.

The fabrication guard refuses, before the kernel loads and with no artifact written, any consumed physical fact not marked `datasheet` or `measured` with a durable source. Durable means an existing `evidence/measurements/<subject>-<feature>-<YYYY-MM-DD>.md` record, or a datasheet title, locator and https URI or existing `evidence/datasheets/` file. Design parameters must record value, author, rationale and explicit test-evidence status. A synthetic value can never enter a fabrication request, and the only template is non-fabrication, so no path produces an artifact labelled for fabrication. A fully qualifying fabrication request clears every input check and is then refused only because no fabrication template exists, so the guard is not simply refusing everything. No part of this spike can output fabrication-labelled geometry.

## Normalized export settings

| Format | Settings | Normalization |
| --- | --- | --- |
| Binary STL | Linear deflection 0.01 mm, angular deflection 0.1 rad | The 80-byte header is replaced with a fixed non-fabrication header. Geometry bytes are unchanged. |
| STEP AP242 | `blobSTEP` with `write.step.schema=5`, millimetres | `FILE_NAME` timestamp fixed at `1970-01-01T00:00:00`. `PRODUCT` name replaced, because OpenCascade appends a process-wide counter to it. `FILE_DESCRIPTION` labelled non-fabrication. Geometry entities are unchanged. |

The STEP normalization refuses any file where these fields are not found exactly as expected, so a timestamp or counter cannot survive silently. The `write.step.product.name` setting had no effect in this build, which is why the name is rewritten.

The manifest beside each artifact records exact inputs, generator, template, engine and runtime versions, the WASM hash, export settings, hashes, units, dimensions, solid count, per-stage volumes, kernel messages and diagnostics. It contains no timestamps or local paths. Timings appear only on the CLI's stdout.

## Packaging and runtime observed

Node 22.22.0, npm 10.9.4, Linux x86_64. See logs 11, 12 and 16.

- **Install:** 7 packages from `npm ci`. `node_modules` is 65.5 MB apparent, of which `replicad-opencascadejs` is 48.8 MB, including a 22.9 MB `replicad_single.wasm` (SHA-256 `a9335919…`).
- **Single run:** about 1.0 to 1.3 s inside the pipeline, including about 0.3 s kernel load. Peak RSS was about 560 to 640 MB across runs.
- **Exit latency:** the process stayed alive about 1.8 s after the pipeline returned, for roughly 3 s total wall time. Not investigated further, since it does not affect output.
- **Repeat use:** 25 runs in one process settled at about 120 ms each and about 520 MB RSS, with no growth beyond warm-up in that bounded sample. Kernel objects are not explicitly freed.

## License

Sources: installed packages and upstream repository files at the published commit `5e4ad9bb5a35bb9ae0571e91c25fa1897ba0570c` (the `gitHead` of both npm packages). Each installed `LICENSE` matches the upstream git blob.

| Package | Version | License | Primary source |
| --- | --- | --- | --- |
| `replicad` | 1.2.1 | MIT | [LICENSE](https://github.com/sgenoud/replicad/blob/5e4ad9bb5a35bb9ae0571e91c25fa1897ba0570c/LICENSE), blob `8c561c95c827aa10cae582785d6b7c632b36bc06` |
| `replicad-opencascadejs` | 1.2.1 | LGPL-2.1-only | [LICENSE](https://github.com/sgenoud/replicad/blob/5e4ad9bb5a35bb9ae0571e91c25fa1897ba0570c/packages/replicad-opencascadejs/LICENSE), blob `8000a6faacf471c537530805ab29523c7732e11a` |
| OpenCascade (in the WASM) | 8.0, as the build reports | LGPL-2.1 with the Open CASCADE exception | [LICENSE_LGPL_21.txt](https://github.com/Open-Cascade-SAS/OCCT/blob/master/LICENSE_LGPL_21.txt), [OCCT_LGPL_EXCEPTION.txt](https://github.com/Open-Cascade-SAS/OCCT/blob/master/OCCT_LGPL_EXCEPTION.txt) |

Other installed dependencies are permissive: `flatbush` 4.7.0 and `flatqueue` 3.1.0 (ISC), `opentype.js` 2.0.0, `@types/opentype.js` 1.3.10 and `zod` 4.6.5 (MIT).

Engineering assessment, not legal advice: the headless tool uses the LGPL build as a separately installed dependency and does not distribute it, so its use is compatible with the MIT app, and generated STL and STEP files are output rather than a copy of the library. **Shipping the WASM to users, for example in the browser, is distribution** and brings LGPL-2.1 obligations, such as the license text, notice and source availability, and allowing the library to be replaced. That is outside this spike and is a decision to make before any browser work.

## Limitations

- Determinism is proven on one Linux x86_64 host with two Node releases. macOS, Windows and ARM were not tested. Any engine version change is a new recording.
- The STEP was read back by another OpenCascade build, which is the same kernel family and not an independent parser. The STL's external checks are fully independent.
- The fixture covers one part. Other geometry can fail differently, particularly complex fillets, which preflight does not fully anticipate.
- Dimensions are exact, but the fillet leaves tangent vertices about 4×10⁻¹⁶ mm from zero. These are reported as they are, and log 06b retains the first run that exposed them. They are numeric noise, not an engineering tolerance.
- Nothing here validates printing, fit, material behaviour or tolerance policy.

## Consequences

Roadmap S5 can build on this engine and manifest shape without a second engine. Before S5, the fabrication guard needs a real fabrication-capable template, real inputs and Andy's part-family decision. Those are separate later work.
