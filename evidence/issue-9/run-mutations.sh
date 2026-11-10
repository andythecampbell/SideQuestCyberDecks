#!/usr/bin/env bash
# Applies each sabotage in a disposable worktree and accepts assertion failures only.
# Usage from repository root: bash evidence/issue-9/run-mutations.sh
set -uo pipefail
unset NODE_ENV
SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
SOURCE_HEAD="$(git -C "$SOURCE_ROOT" rev-parse HEAD)"
WORKTREE="$(mktemp -d "${TMPDIR:-/tmp}/generator-spike-mutations.XXXXXX")/checkout"
LOG="$SOURCE_ROOT/evidence/issue-9/17-mutations.log"
cleanup() {
  git -C "$SOURCE_ROOT" worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
  rm -rf "$(dirname "$WORKTREE")"
}
interrupted() { cleanup; trap - EXIT; exit 130; }
trap cleanup EXIT
trap interrupted HUP INT TERM
test -z "$(git -C "$SOURCE_ROOT" status --porcelain=v1 --untracked-files=all -- tools/generator-spike/src tools/generator-spike/test)" || { echo "source tree is not clean" >&2; exit 2; }
git -C "$SOURCE_ROOT" worktree add --detach "$WORKTREE" "$SOURCE_HEAD" >/dev/null || exit 2
ROOT="$WORKTREE"
TOOL="$ROOT/tools/generator-spike"
EVID="$ROOT/evidence/issue-9"
cd "$ROOT"

failures=0
: > "$LOG"
echo "baseline head: $SOURCE_HEAD" >> "$LOG"
if ! (cd "$TOOL" && npm ci --no-audit --no-fund) >> "$LOG" 2>&1; then
  echo "dependency install failed; mutations not run" | tee -a "$LOG"
  exit 2
fi
if ! (cd "$TOOL" && node --test --test-reporter=spec) >> "$LOG" 2>&1; then
  echo "baseline failed; mutations not run" | tee -a "$LOG"
  exit 2
fi
echo "baseline: GREEN" >> "$LOG"
mutate() {
  local id="$1" description="$2" file="$3" old="$4" new="$5" test_file="$6"
  python3 "$EVID/mutate.py" "$TOOL/$file" "$old" "$new" || { echo "$id: mutation failed to apply" | tee -a "$LOG"; failures=$((failures+1)); return; }
  (cd "$TOOL" && node --test --test-reporter=spec "$test_file") > "$ROOT/.mutation-output" 2>&1
  local code=$?
  git checkout -q -- "tools/generator-spike/$file"
  local assertion_failure=false infrastructure_failure=false
  grep -aq 'AssertionError' "$ROOT/.mutation-output" && assertion_failure=true
  grep -aqE 'SyntaxError|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|Could not find|test failed to load|npm ERR' "$ROOT/.mutation-output" && infrastructure_failure=true
  {
    echo "### $id: $description"
    echo "file: $file   test: $test_file"
    grep -a -E '^✖ |^ℹ (pass|fail) ' "$ROOT/.mutation-output" | awk '!seen[$0]++' | head -12
    echo "exit code: $code; assertion failure: $assertion_failure; infrastructure failure: $infrastructure_failure"
    if [ "$code" -ne 0 ] && [ "$assertion_failure" = true ] && [ "$infrastructure_failure" = false ]; then echo "KILLED"; else echo "INVALID OR SURVIVED"; fi
    echo
  } | tee -a "$LOG"
  [ "$code" -ne 0 ] && [ "$assertion_failure" = true ] && [ "$infrastructure_failure" = false ] || failures=$((failures+1))
}

mutate M01 "STEP timestamp normalization removed" src/verify.mjs \
  ".replace(FILE_NAME_TIMESTAMP, \`\$1\${NORMALIZED_STEP_TIMESTAMP}\$3\`)" "" test/determinism.test.mjs
mutate M02 "STEP product counter normalization removed" src/verify.mjs \
  "const normalizedBody = body.replace(PRODUCT_NAMES, \`\$1\${STEP_PRODUCT_NAME}\$2\${STEP_PRODUCT_NAME}\$3\`)" "const normalizedBody = body" test/determinism.test.mjs
mutate M03 "guard stops checking physical facts" src/guard.mjs \
  "function checkPhysicalFact(input, path, repoRoot, issues) {" "function checkPhysicalFact(input, path, repoRoot, issues) { return" test/guard.test.mjs
mutate M04 "guard treats every cited repository file as present" src/guard.mjs \
  "function repoFileExists(repoRoot, relativePath) {" "function repoFileExists(repoRoot, relativePath) { return true // mutation" test/guard.test.mjs
mutate M05 "synthetic values allowed in fabrication" src/guard.mjs \
  "    if (input.class === 'synthetic') {\n      issues.push({ code: 'SYNTHETIC_IN_FABRICATION'" "    if (false) {\n      issues.push({ code: 'SYNTHETIC_IN_FABRICATION'" test/guard.test.mjs
mutate M06 "design parameters no longer need test evidence" src/guard.mjs \
  "  checkTestEvidence(input.testEvidence, path, repoRoot, issues)\n" "" test/guard.test.mjs
mutate M07 "template declares itself fabrication-capable" src/synthetic-plate.mjs \
  "purposes: Object.freeze(['non-fabrication'])" "purposes: Object.freeze(['non-fabrication', 'fabrication'])" test/guard.test.mjs
mutate M08 "manifest relabelled fabrication-eligible" src/manifest.mjs \
  "fabricationEligible: false" "fabricationEligible: true" test/generate.test.mjs
mutate M09 "a refused request still writes a file" src/generate.mjs \
  "  const request = parseRequest(readRequestFile(requestPath))\n" "  nodeFs.mkdirSync(outDir, { recursive: true }); nodeFs.writeFileSync(join(outDir, 'leak.txt'), 'x')\n  const request = parseRequest(readRequestFile(requestPath))\n" test/cli-refusal.test.mjs
mutate M10 "output verification skipped" src/generate.mjs \
  "const issues = verifyPart({ expected, built, stl: stlAnalysis, step: stepAnalysis, stepReimport })" "const issues = []" test/generate.test.mjs
mutate M11 "STL watertightness always reported" src/verify.mjs \
  "watertight: closed && signedVolumeMm3 > 0" "watertight: true" test/verify.test.mjs
mutate M12 "genus check removed from verification" src/verify.mjs \
  "check(stl.genus === expected.throughFeatureCount," "check(true || stl.genus === expected.throughFeatureCount," test/verify.test.mjs
mutate M13 "pocket built at half depth" src/synthetic-plate.mjs \
  "shape.cut(makeBox([v.pocketMinX, v.pocketMinY, t - v.pocketDepth]," "shape.cut(makeBox([v.pocketMinX, v.pocketMinY, t - v.pocketDepth / 2]," test/build.test.mjs
mutate M14 "corner fillet skipped" src/synthetic-plate.mjs \
  "shape.fillet(v.cornerRadius, (edge) => edge.inDirection('Z'))" "shape" test/build.test.mjs
mutate M15 "engine version pin not enforced" src/engine.mjs \
  "  const mismatches = Object.keys(pinned).filter((name) => installed[name] !== pinned[name])\n" "  const mismatches = []\n" test/build.test.mjs
mutate M16 "WebAssembly kernel exceptions left undecoded" src/engine.mjs \
  "  if (thrown instanceof WebAssembly.Exception) {" "  if (false) {" test/build.test.mjs
mutate M17 "generator imports preview data" src/cli.mjs \
  "import { parseArgs } from 'node:util'\n" "import { parseArgs } from 'node:util'\nimport '../../../app/public/previews/manifest.json' with { type: 'json' }\n" test/purity.test.mjs
mutate M18 "generator path references a catalog" src/generate.mjs \
  "const NAMES = Object.freeze({" "const catalogDir = 'catalog/components'\nconst NAMES = Object.freeze({" test/purity.test.mjs
mutate M19 "strict schema relaxed so a fabrication label can be smuggled in" src/request.mjs \
  "const requestSchema = z.strictObject({" "const requestSchema = z.looseObject({" test/request.test.mjs
mutate M20 "the kernel loads before the fabrication guard runs" src/generate.mjs \
  "  const template = checkRequest(request, { repoRoot })\n" "  await (deps.loadEngine ?? loadEngine)()\n  const template = checkRequest(request, { repoRoot })\n" test/generate.test.mjs
mutate M21 "a build with no solid is not diagnosed" src/generate.mjs \
  "  if (built.solid === undefined) {" "  if (false) {" test/generate.test.mjs

rm -f "$ROOT/.mutation-output"
git diff --quiet -- tools/generator-spike/src tools/generator-spike/test || { echo "source tree was not restored" >&2; exit 3; }
test "$(git -C "$SOURCE_ROOT" rev-parse HEAD)" = "$SOURCE_HEAD" || { echo "source checkout head changed" >&2; exit 3; }
test -z "$(git -C "$SOURCE_ROOT" status --porcelain=v1 --untracked-files=all -- tools/generator-spike/src tools/generator-spike/test)" || { echo "source checkout changed" >&2; exit 3; }
echo "source checkout restored: true" | tee -a "$LOG"
echo "survivors or failures: $failures" | tee -a "$LOG"
[ "$failures" -eq 0 ]
