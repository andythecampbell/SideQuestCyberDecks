#!/usr/bin/env bash
# Applies each sabotage to committed source, confirms the named test fails, and restores it.
# Usage: bash evidence/issue-9/run-mutations.sh   (requires a clean tools/generator-spike/src and test)
set -uo pipefail
unset NODE_ENV
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TOOL="$ROOT/tools/generator-spike"
EVID="$ROOT/evidence/issue-9"
LOG="$EVID/17-mutations.log"
cd "$ROOT"
git diff --quiet -- tools/generator-spike/src tools/generator-spike/test || { echo "source tree is not clean" >&2; exit 2; }

failures=0
: > "$LOG"
mutate() {
  local id="$1" description="$2" file="$3" old="$4" new="$5" test_file="$6"
  python3 "$EVID/mutate.py" "$TOOL/$file" "$old" "$new" || { echo "$id: mutation failed to apply" | tee -a "$LOG"; failures=$((failures+1)); return; }
  (cd "$TOOL" && node --test --test-reporter=spec "$test_file") > "$EVID/.mutation-output" 2>&1
  local code=$?
  git checkout -q -- "tools/generator-spike/$file"
  {
    echo "### $id: $description"
    echo "file: $file   test: $test_file"
    grep -a -E '^✖ |^ℹ (pass|fail) ' "$EVID/.mutation-output" | awk '!seen[$0]++' | head -12
    echo "exit code: $code (expected non-zero)"
    if [ "$code" -eq 0 ]; then echo "SURVIVED"; else echo "KILLED"; fi
    echo
  } | tee -a "$LOG"
  [ "$code" -ne 0 ] || failures=$((failures+1))
}

mutate M01 "STEP timestamp normalization removed" src/verify.mjs \
  ".replace(FILE_NAME_TIMESTAMP, \`\$1\${NORMALIZED_STEP_TIMESTAMP}\$3\`)" "" test/determinism.test.mjs
mutate M02 "STEP product counter normalization removed" src/verify.mjs \
  "const normalizedBody = body.replace(PRODUCT_NAMES, \`\$1\${STEP_PRODUCT_NAME}\$2\${STEP_PRODUCT_NAME}\$3\`)" "const normalizedBody = body" test/determinism.test.mjs
mutate M03 "guard stops checking physical facts" src/guard.mjs \
  "function checkPhysicalFact(input, path, repoRoot, issues) {" "function checkPhysicalFact(input, path, repoRoot, issues) { return" test/guard.test.mjs
mutate M04 "guard treats every cited source as present" src/guard.mjs \
  "    return stat.isFile() && stat.size > 0" "    return true" test/guard.test.mjs
mutate M05 "synthetic values allowed in fabrication" src/guard.mjs \
  "    if (input.class === 'synthetic') {\n      issues.push({ code: 'SYNTHETIC_IN_FABRICATION'" "    if (false) {\n      issues.push({ code: 'SYNTHETIC_IN_FABRICATION'" test/guard.test.mjs
mutate M06 "design parameters no longer need test evidence" src/guard.mjs \
  "  checkTestEvidence(input.testEvidence, path, repoRoot, issues)\n" "" test/guard.test.mjs
mutate M07 "template declares itself fabrication-capable" src/synthetic-plate.mjs \
  "purposes: Object.freeze(['non-fabrication'])" "purposes: Object.freeze(['non-fabrication', 'fabrication'])" test/guard.test.mjs
mutate M08 "manifest relabelled fabrication-eligible" src/manifest.mjs \
  "fabricationEligible: false" "fabricationEligible: true" test/generate.test.mjs
mutate M09 "a refused request still writes a file" src/generate.mjs \
  "  const request = parseRequest(readRequestFile(requestPath))\n" "  mkdirSync(outDir, { recursive: true }); writeFileSync(join(outDir, 'leak.txt'), 'x')\n  const request = parseRequest(readRequestFile(requestPath))\n" test/cli-refusal.test.mjs
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

rm -f "$EVID/.mutation-output"
git diff --quiet -- tools/generator-spike/src tools/generator-spike/test || { echo "source tree was not restored" >&2; exit 3; }
echo "survivors or failures: $failures" | tee -a "$LOG"
[ "$failures" -eq 0 ]
