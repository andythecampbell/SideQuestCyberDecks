# Articulated preview browser QA

## Result: PASS for the two previously blocking runtime defects

Executed the Vite development server (React StrictMode active) in sandboxed Chrome for Testing 145.0.7632.6 as unprivileged user `sidequestqa`; Chromium sandbox remained enabled.

## Verified

- Initial OPEN rendering completed, then mouse CLOSED, keyboard Enter OPEN, and keyboard Space CLOSED all set the expected `aria-pressed` state.
- No console errors or uncaught page errors occurred during normal load or pose interaction. The prior `removeChild` `NotFoundError` did not recur.
- No HTTP failures or failed requests occurred. The prior implicit `/favicon.ico` 404 is eliminated by the inline favicon declaration.
- All four GLBs returned HTTP 200 during the historical runs: the base and lid GLBs under their earlier unprefixed body-name filenames, plus `pi.glb` and `display.glb`. The base/lid URLs recorded in the JSON were later updated to `apache-2800-base.glb` and `apache-2800-lid.glb` after a filename-only rename; those renamed URLs were not served in these runs and no fresh run was made. Payloads are byte-identical (SHA-256 `e8029e85…a0ce` base, `be91cd84…cd0` lid); see the `filenameMigration` field in each `evidence/browser-qa-*.json`.
- The same fixed build passed this dev-server flow five consecutive times; per-run JSON/logs are `evidence/browser-qa-dev-run-{1..5}.{json,log}`.
- Updated OPEN and CLOSED screenshots were captured from the passing dev-server run.
- The existing intercepted display-load screenshot visually shows a part-specific error with the rest of the geometry intact. The historical automated isolation check reported false because its selector did not find the alert, so this remains visual evidence rather than a fresh passing automated assertion. A later second-context attempt exhausted this host's constrained Chromium resources and is not used as evidence.

## Root-cause evidence

- `evidence/browser-qa-red-results.json` retains the failing pre-fix dev-server run with the full React deletion stack and the exact favicon console URL.
- `evidence/browser-qa-diagnostic-results.json` shows React attempting to remove the Drei `Html` Suspense fallback (`Loading base…`) after the portal node had already been detached (`actualParent: null`).
- `evidence/codex-red.txt` records both focused regression tests failing before production edits; `evidence/codex-green.txt` records them passing after the fixes.

## Evidence

- Passing machine-readable result: `evidence/browser-qa-results.json`
- Five repeated dev-server passing results: `evidence/browser-qa-dev-run-{1..5}.json`
- Pre-fix failing result: `evidence/browser-qa-red-results.json`
- Portal diagnostic result: `evidence/browser-qa-diagnostic-results.json`
- Updated OPEN screenshot: `evidence/browser-screenshots/open.png`
- Updated CLOSED screenshot: `evidence/browser-screenshots/closed.png`
- Existing intercepted display failure: `evidence/browser-screenshots/display-load-failure.png`

## Scope and remaining TODOs

- Deck 001 exact endpoint calibration remains unresolved and required before issue #2 can close; no fit or fabrication claim is made.
- Source/model license URLs and license disposition remain TODOs and were not changed.
- No blocker remains for the two runtime defects covered by this QA pass.
