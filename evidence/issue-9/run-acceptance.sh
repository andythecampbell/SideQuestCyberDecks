#!/usr/bin/env bash
# Reproduces the issue #9 acceptance records from a clean tree.
# Usage: bash evidence/issue-9/run-acceptance.sh
# Optional environment (the external step is skipped with a note when these are absent):
#   EXT_PYTHON   Python with trimesh, numpy and cadquery-ocp installed
#   ADMESH_BIN   admesh binary
#   NODE24_BIN   a second Node.js release for the cross-runtime comparison
set -euo pipefail
unset NODE_ENV
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TOOL="$ROOT/tools/generator-spike"
EVID="$ROOT/evidence/issue-9"
WORK="$(mktemp -d /tmp/generator-spike-acceptance.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT
REQUEST="fixtures/synthetic-plate.non-fabrication.request.json"
cd "$TOOL"

{
  echo "# Packaging and clean install"
  echo "node: $(node --version)   npm: $(npm --version)   platform: $(uname -sm)"
  rm -rf node_modules
  start=$(date +%s.%N)
  npm ci --no-audit --no-fund --cache "$WORK/npm-cache"
  end=$(date +%s.%N)
  python3 -c "print('npm ci wall seconds with an empty npm cache: %.2f' % ($end - $start))"
  echo "node_modules bytes (apparent): $(du -sb --apparent-size node_modules | cut -f1)"
  for p in replicad replicad-opencascadejs zod; do echo "  $p bytes: $(du -sb --apparent-size node_modules/$p | cut -f1)"; done
  echo "wasm bytes: $(stat -c%s node_modules/replicad-opencascadejs/dist/replicad_single.wasm)   sha256: $(sha256sum node_modules/replicad-opencascadejs/dist/replicad_single.wasm | cut -d' ' -f1)"
  echo "direct dependencies: $(node -p "Object.entries(require('./package.json').dependencies).map(([k,v])=>k+'@'+v).join(' ')")"
  echo "installed packages: $(npm ls --all --parseable 2>/dev/null | tail -n +2 | wc -l)"
} > "$EVID/11-packaging.log" 2>&1

run() {
  local name="$1" node_bin="$2"
  local out="$WORK/$name"
  local log="$WORK/$name.time"
  /usr/bin/time -v "$node_bin" src/cli.mjs --request "$REQUEST" --out "$out" > "$WORK/$name.json" 2> "$log"
  grep -E 'Maximum resident|Elapsed' "$log" | sed "s/^/  [$name] /"
  python3 -c "import json,sys; d=json.load(open('$WORK/$name.json')); print('  [$name] CLI observations:', d['observations'])"
}

{
  echo "# Two clean runs from fresh output directories"
  echo "git head: $(git -C "$ROOT" rev-parse HEAD)   node: $(node --version)"
  run run-a node
  run run-b node
  echo
  cd "$WORK"
  sha256sum run-a/* run-b/*
  echo
  for f in NON-FABRICATION-synthetic-plate-r1.stl NON-FABRICATION-synthetic-plate-r1.step manifest.json; do
    cmp "run-a/$f" "run-b/$f"
    echo "byte-identical: $f"
  done
  cd "$TOOL"
  echo
  echo "STL header (first 80 bytes):"; head -c 80 "$WORK/run-a/NON-FABRICATION-synthetic-plate-r1.stl"; echo
  echo "STEP header:"; head -c 420 "$WORK/run-a/NON-FABRICATION-synthetic-plate-r1.step"; echo
  echo
  echo "STEP entities:"
  grep -E -o 'MANIFOLD_SOLID_BREP|CLOSED_SHELL|OPEN_SHELL|SI_UNIT\(\.MILLI\.,\.METRE\.\)' "$WORK/run-a/NON-FABRICATION-synthetic-plate-r1.step" | sort | uniq -c
  echo
  echo "Manifest geometry summary:"
  python3 - "$WORK/run-a/manifest.json" <<'PY'
import json,sys
m=json.load(open(sys.argv[1]))
print(json.dumps({k:m[k] for k in ['purpose','fabricationEligible','label','units','generator','engine','runtime','outputs']},indent=2))
g=m['geometry']
print(json.dumps({k:g[k] for k in ['units','solidCount','valid','dimensionsMm','boundsMm','volumeMm3','faces','stages']},indent=2))
PY
  mkdir -p "$EVID/sample-output"
  cp "$WORK/run-a/manifest.json" "$EVID/sample-output/manifest.json"
} > "$EVID/12-two-clean-runs.log" 2>&1

{
  echo "# Rejected fabrication fixture: no artifact"
  out="$WORK/rejected-out"
  set +e
  node src/cli.mjs --request fixtures/rejected-fabrication.estimate.request.json --out "$out"
  code=$?
  set -e
  echo "exit code: $code (expected 2)"
  if [ -e "$out" ]; then echo "ARTIFACT WRITTEN"; exit 1; else echo "output directory absent: true"; fi
  ls -A "$WORK" | grep -c '^rejected-out' || true
} > "$EVID/13-rejected-fabrication.log" 2>&1

if [ -n "${EXT_PYTHON:-}" ] && [ -n "${ADMESH_BIN:-}" ]; then
  {
    echo "# External validation of run-a"
    ADMESH_BIN="$ADMESH_BIN" "$EXT_PYTHON" "$EVID/external_validate.py" "$WORK/run-a"
    echo "exit code: 0"
    echo
    echo "# Validator sabotage: the same validator must reject a deliberately damaged copy"
    damaged="$WORK/damaged"
    cp -r "$WORK/run-a" "$damaged"
    python3 - "$damaged/NON-FABRICATION-synthetic-plate-r1.stl" <<'PY'
import struct,sys
p=sys.argv[1]
b=bytearray(open(p,'rb').read())
n=struct.unpack_from('<I',b,80)[0]
struct.pack_into('<I',b,80,n-1)
open(p,'wb').write(b[:84+(n-1)*50])
PY
    set +e
    ADMESH_BIN="$ADMESH_BIN" "$EXT_PYTHON" "$EVID/external_validate.py" "$damaged" > "$WORK/damaged.json" 2>&1
    code=$?
    set -e
    python3 -c "import json; d=json.load(open('$WORK/damaged.json')); print('damaged copy failures:', json.dumps(d['failures'], indent=2))"
    echo "exit code for damaged copy: $code (expected 1)"
    [ "$code" = "1" ]
  } > "$EVID/14-external-validation.log" 2>&1
else
  echo "skipped: EXT_PYTHON and ADMESH_BIN not set" > "$EVID/14-external-validation.log"
fi

if [ -n "${NODE24_BIN:-}" ]; then
  {
    echo "# Cross-runtime comparison"
    "$NODE24_BIN" --version
    run run-node24 "$NODE24_BIN"
    cd "$WORK"
    for f in NON-FABRICATION-synthetic-plate-r1.stl NON-FABRICATION-synthetic-plate-r1.step; do
      cmp "run-a/$f" "run-node24/$f"
      echo "byte-identical across runtimes: $f"
    done
    echo "manifest differs only by the recorded runtime:"
    diff run-a/manifest.json run-node24/manifest.json || true
    cd "$TOOL"
  } > "$EVID/15-cross-runtime.log" 2>&1
fi

{
  echo "# Repeated runs reusing one kernel (long-lived process observation)"
  node "$EVID/memory-probe.mjs" "$TOOL" 25
} > "$EVID/16-kernel-reuse.log" 2>&1
