# Issue #7 evidence: configuration snapshots

Records for persistence, import/export, the snapshot codec and the first committed Deck 001 snapshot. These are automated software records. They say nothing about physical fit or calibration, and the sandboxed browser run is **not** Andy's interactive (H) check, which remains pending.

## Test-first record

Each `NN-*.red.log` is raw Vitest output plus the exit code, captured from `cd app && npx vitest run <file> [-t <name>]` **before** the matching production code existed, except where the table says otherwise. Logs 01–17 ran in this shell, which exports `NODE_ENV=production`; log 18 and the final gates use `env -u NODE_ENV`.

| Log | Slice | RED observed |
| --- | --- | --- |
| 01 | canonical serialization | missing `./snapshot` module |
| 02 | file gate: size, JSON, version | `parseSnapshot` not implemented |
| 03 | strict v2 parsing and messages | invalid v2 documents accepted |
| 04 | duplicate placement ids named | message did not name the id |
| 05 | exact catalog revisions | missing revisions accepted |
| 06 | resolution in every pose, lid on box | `POSES` absent, lid-on-box accepted |
| 07 | v1 migration, dropped keys, rejections | v1 passed through unmigrated |
| 08 | frozen fixtures | fixture files absent (ENOENT) |
| 09 | browser persistence and quarantine | missing `./browserPersistence` module |
| 10 | App persistence wiring | no writes and no reload behaviour |
| 11 | import, export and reset UI | controls absent |
| 12 | repository snapshot validation | missing modules and snapshot files |
| 14 | no-claim language guard (mutation) | injected "fits" claim fails the guard |
| 15 | domain purity guard (mutation) | injected React import and `localStorage` fail |
| 16 | enclosure subtitle | imported box still called the 2800 preview |
| 17 | neutral wording, bounded rejection list | wrong wording, unbounded list |
| 18 | exactly-once under StrictMode (mutation) | writing inside a state updater doubles the write in React's development build |
| 19 | reset persistence failures | reset replaced the mounted design after removal or quarantine failed |

Logs 13 and the `final-*` logs are not RED logs. `13-snapshot-derivation.log` records that `snapshots/deck-001-illustrative.json` is byte-identical to `serializeSnapshot(articulatedDeck)`.

Mutation checks (14, 15, 18) were reverted before the green suite. Log 18 matters because `app/src/main.tsx` uses StrictMode: only React's development build double-invokes state updaters, so the guard is only meaningful with `NODE_ENV` unset.

### Corrections made after the fact

- **Log 11 is a re-capture.** The first capture was cut off at failure 16/24 by a `| head` used only for on-screen display (visible in history at commit `541fbbb`), so it had no summary or exit code. The re-capture ran the same suite with the UI-slice source files restored from commit `ef43680`, immediately reverted afterwards.
- **`final-build.log`** had one trailing space removed from a Vite reporter line so `git diff --check` passes; the content is otherwise the raw output.
- **One test expectation was wrong, not the product.** In the v1 notice test, a regex assumed `legacy` is reported before `placements[1].label`; the product reports document order. The expectation now checks each key independently.

## Browser QA

Reproduce from the repository root, as root: `bash evidence/issue-7/run-browser-qa.sh`.

The runner starts `env -u NODE_ENV npm run dev --workspace app -- --host 127.0.0.1 --port 4173 --strictPort` and drives `browser-qa.cjs` as the unprivileged `sidequestqa` user with `chromiumSandbox: true` and no `--no-sandbox` flag. It copies the harness and frozen fixtures to that user's home because the worktree path is not readable by it; no permission on any existing path is changed. It stops the dev server on exit and removes its temporary directory.

`browser-qa.json` records status, the served-source identity and every check. The recorded run: **passed**, Chrome for Testing 149.0.7827.55, base commit `78fecbd660ef68c5a2fccca227cc3c3e004ca9b9`, SHA-256 `8dbdf5ec9abf68589a5d83c6e685e366e46bf88dc5acd62096c8682e086f5679` over the 72 `app/`, `catalog/` and `snapshots/` files served, with a clean status. **93 checks passed at each of three viewports** (normal 1440×1000, 200%-equivalent 720×500 @2x, short 1280×560), with 0 console errors, 0 page errors and 0 failed loads. The evidence commit changes only `evidence/`, so the code at branch head is what was served.

What the run exercises per viewport, in one browser context:

- **Edit and reload**: one write of canonical bytes per real edit, `modifiedAt` stamped once and advanced by a second edit, restored exactly on reload with no writes on load.
- **Exclusions**: rejected edits, pose changes, list selection and mesh selection write nothing, leave stored bytes and `modifiedAt` unchanged, and leave no view state in the stored payload. Pose and selection are not restored by reload.
- **Export, clear, import**: export equals the stored bytes; after `localStorage.clear()` the fixture shows; importing the exported file writes once and restores byte-identical state and timestamps; re-export and export after reload are byte-identical.
- **Rejected files** (11 cases, including a hand-corrupted truncated export and an oversized file): a specific readable message, and storage, the loaded design and the display all unchanged.
- **v1 import**: visible migration notice naming dropped keys; stored as v2 with the file's timestamps; the box enclosure is named in the header.
- **Corrupt stored value**: no writes on load, fixture shown with a notice, value untouched through viewing and reload; the first committed edit writes a verified quarantine copy before anything replaces it.
- **Reset**: needs a second confirming activation; removes the saved value; the fixture persists through reload; the quarantine copy stays. Mounted failure tests additionally prove that removal or quarantine failure keeps the mounted design unchanged and explicitly warns that reload can restore the saved value.
- **Constrained views**: the persistent no-fit warning never covers a control (scrolled and unscrolled); no fit claims appear in the panel text.

Screenshots: `normal-edited.png`, `normal-rejected-import.png`, `normal-corrupt-storage.png`, `normal-reset.png`, and `zoom-200-*` / `short-*` edited and rejected-import views.

`browser-qa-reset-failure.json` is the focused post-review run: `QA_VIEWPORT=normal QA_RESULT_FILE=browser-qa-reset-failure.json QA_PORT=4174 bash evidence/issue-7/run-browser-qa.sh`. It served base commit `6c9e8b0e26c42019f7016d528a9aa60435eb9810` plus SHA-256 `8af5a464eff3dcbefeace5ae7fd3c0c46312a8123f51427c218856578c9c4e70` over the 72 source files, including the three listed uncommitted app changes. All 96 checks passed, including three removal-failure checks; there were 0 console errors, page errors or failed loads.

## Final gates

`env -u NODE_ENV npm test` — 23 files, 269 tests passed (`final-test.log`). `env -u NODE_ENV npm run build` — passed with the existing bundle-size advisory (`final-build.log`). `git diff --check origin/main...HEAD` — `final-diff-check.log`.

## Acceptance mapping (issue #7)

| Criterion | Evidence |
| --- | --- |
| (A) Canonical stability and semantic migration | `snapshot.test.ts` golden bytes and byte-stability; differently formatted v2 and v1 preserve design then canonicalize; browser `round-trip-byte-identical`, `reload-export-byte-identical` |
| (A) Frozen v1/v2 fixtures; v1 notice; unchanged transforms | `snapshotFrozen.test.ts` with pinned SHA-256 and literal resolved transforms; browser `v1-*` |
| (A) Each rejection specific; loaded config unchanged | `snapshot.test.ts`; mounted `appPersistence.test.tsx`; browser `reject-*` (see the table of 11 cases) |
| (A) Pose/selection zero writes; import keeps timestamps; one `modifiedAt` per real edit | mounted tests under StrictMode (`18`); browser `exclusions-*`, `import-preserves-timestamps`, `edit-*` |
| (A) Repository snapshots validate and resolve in all poses | `repoSnapshots.test.ts`, `domain/repoSnapshots.test.ts` |
| (H) Interactive check by Andy | **Pending.** The automated browser run is a rehearsal of the same steps, not this check. |

## Decisions recorded from Andy

Andy accepted `snapshots/` as the repository snapshot path and confirmed `hosyond-7in-touch` / Hosyond in PR #11. Mounting-hole and connector positions remain a later physical-evidence follow-up; Andy will update them as the project progresses. They are not a blocker for this explicitly illustrative, uncalibrated snapshot.
