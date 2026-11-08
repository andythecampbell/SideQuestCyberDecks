#!/usr/bin/env bash
# Issue #7 sandboxed browser QA runner.
#
# Usage, from the repository root, as root:  bash evidence/issue-7/run-browser-qa.sh
#
# The worktree may be unreadable by the QA user, so the harness and its input files are copied to
# the QA user's home, and results are copied back. No permission on any existing path is changed.
# The Chromium sandbox stays enabled. The dev server is always stopped, including on failure.
set -uo pipefail

repo="$(cd "$(dirname "$0")/../.." && pwd)"
out="$repo/evidence/issue-7"
qa_user="${QA_USER:-sidequestqa}"
qa_dir="/home/$qa_user/issue-7-qa"
port="${QA_PORT:-4173}"
url="http://127.0.0.1:${port}/"
node_bin="$(command -v node)"

if ss -ltn 2>/dev/null | grep -q ":${port} "; then echo "port ${port} is busy; refusing to run" >&2; exit 2; fi

server_pgid=""
cleanup() {
  if [ -n "$server_pgid" ] && kill -0 -- "-$server_pgid" 2>/dev/null; then
    kill -TERM -- "-$server_pgid" 2>/dev/null || true
    for _ in $(seq 1 20); do kill -0 -- "-$server_pgid" 2>/dev/null || break; sleep 0.25; done
    kill -KILL -- "-$server_pgid" 2>/dev/null || true
  fi
  rm -rf "$qa_dir"
}
trap cleanup EXIT

rm -rf "$qa_dir"
install -d -o "$qa_user" -g "$qa_user" -m 700 "$qa_dir" "$qa_dir/out" "$qa_dir/work" "$qa_dir/fixtures"
install -o "$qa_user" -g "$qa_user" -m 600 "$out/browser-qa.cjs" "$qa_dir/browser-qa.cjs"
for f in snapshot-v1-extra-keys.frozen.json snapshot-v2.frozen.json; do
  install -o "$qa_user" -g "$qa_user" -m 600 "$repo/app/src/domain/__fixtures__/$f" "$qa_dir/fixtures/$f"
done

# Source identity: sorted `git ls-files -co --exclude-standard -- app catalog snapshots`, each as path\0content\0.
"$node_bin" - "$repo" > "$qa_dir/identity.json" <<'NODE'
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const repo = process.argv[2]
const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' }).trim()
const files = git('ls-files', '-co', '--exclude-standard', '--', 'app', 'catalog', 'snapshots').split('\n').filter(Boolean).sort()
const h = crypto.createHash('sha256')
for (const f of files) { h.update(f + '\0'); h.update(fs.readFileSync(path.join(repo, f))); h.update('\0') }
console.log(JSON.stringify({
  baseCommit: git('rev-parse', 'HEAD'),
  sourceContentSha256: h.digest('hex'),
  sourceFiles: files.length,
  sourceStatusPorcelain: git('status', '--porcelain', '--', 'app', 'catalog', 'snapshots').split('\n').filter(Boolean),
  hashRecipe: "sha256 over sorted `git ls-files -co --exclude-standard -- app catalog snapshots`, each as path\\0content\\0",
}, null, 2))
NODE
chown "$qa_user":"$qa_user" "$qa_dir/identity.json"

cd "$repo" || exit 3
# NODE_ENV is unset so the dev server serves React's development build, where StrictMode double-invocation
# is active, matching `npm run dev`. A shell that exports NODE_ENV=production would otherwise silently change this.
env -u NODE_ENV setsid npm run dev --workspace app -- --host 127.0.0.1 --port "$port" --strictPort > "$qa_dir/server.log" 2>&1 &
server_pgid=$!

for _ in $(seq 1 120); do
  curl -sf -o /dev/null "$url" && break
  kill -0 "$server_pgid" 2>/dev/null || { echo "dev server exited early" >&2; cat "$qa_dir/server.log" >&2; exit 4; }
  sleep 0.5
done
curl -sf -o /dev/null "$url" || { echo "dev server never became ready" >&2; exit 4; }

set +e
runuser -u "$qa_user" -- env -i HOME="/home/$qa_user" PATH=/usr/bin:/bin \
  QA_URL="$url" QA_OUT="$qa_dir/out" QA_WORK="$qa_dir/work" QA_IDENTITY="$qa_dir/identity.json" QA_FIXTURES="$qa_dir/fixtures" \
  "$node_bin" "$qa_dir/browser-qa.cjs"
status=$?
set -e

cp "$qa_dir/out/browser-qa.json" "$out/browser-qa.json"
cp "$qa_dir"/out/*.png "$out/" 2>/dev/null || true
exit "$status"
