#!/usr/bin/env bash
# Fresh QuickJS process per compile, fresh Node/Wasm instance per application sample.
set -euo pipefail
if [[ $# != 2 ]]; then
    echo "Usage: bash $0 SHARED_RV32_REACTOR OUTPUT_JSON" >&2
    exit 2
fi
reactor=$(realpath "$1")
output=$(realpath -m "$2")
scripts=$(realpath "$(dirname "$0")")
cd "$(git rev-parse --show-toplevel)"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
benchmark=(ttmp/2026/11/19/PICOCALC-COMPILER-ISSUE--*/scripts/04-compile-phase-timing.c)
python3 -B - "${benchmark[0]}" "$tmp/quickjs.c" <<'PY'
from pathlib import Path
import sys

base, out = map(Path, sys.argv[1:])
source = base.read_text().replace("CLOCK_MONOTONIC", "CLOCK_PROCESS_CPUTIME_ID")
loaders = ('  snprintf(path, sizeof path, "%s/typed-rv32.js", argv[1]); eval(ctx, path);\n'
           '  snprintf(path, sizeof path, "%s/typed-world.js", argv[1]); eval(ctx, path);\n')
anchor = '  double t1 = JS_VALUE_GET_FLOAT64(js_now(ctx, JS_UNDEFINED, 0, NULL));'
assert source.count(loaders) == source.count(anchor) == 1
source = source.replace(loaders, "").replace(anchor, '  if (strcmp(argv[4], "-")) {\n  '
    + loaders.splitlines(keepends=True)[0] + "  }\n" + loaders.splitlines(keepends=True)[1] + anchor)
out.write_text(source)
PY
gcc -O2 -Ipicocalc-os/third_party/quickjs -o "$tmp/quickjs" "$tmp/quickjs.c" \
    picocalc-os/build/qjs/*.o -lm -ldl -lpthread
wasm=picocalc-os/build/typed-world-reactor.wasm
node "$scripts/05-prepare-chess.mjs" wasm "$tmp/app" "$wasm" >"$tmp/wasm.json"
node "$scripts/05-prepare-chess.mjs" rv32 "$tmp/app" "$reactor" >"$tmp/rv32.json"
for ((i=0; i<9; i++)); do
    "$tmp/quickjs" picocalc-os/compiler "$tmp/app/chess.typed" "$wasm" - \
        "$scripts/13-compile-chess.js" >>"$tmp/compile.jsonl"
    "$tmp/quickjs" picocalc-os/compiler "$tmp/app/chess.typed" "$wasm" "$reactor" \
        "$scripts/13-compile-chess.js" >>"$tmp/compile.jsonl"
    node "$scripts/07-chess-world-oracle.mjs" --timing-only >>"$tmp/app.jsonl"
done
python3 -B - "$tmp" "$output" "$(node --version)" "$(git rev-parse HEAD)" <<'PY'
import json, platform, statistics, sys
from pathlib import Path

work, out = map(Path, sys.argv[1:3])

def load(path):
    return [json.loads(line) for line in (work / path).read_text().splitlines()]

def summary(rows, names):
    return {name: {"median": statistics.median(r[name] for r in rows),
                   "min": min(r[name] for r in rows), "max": max(r[name] for r in rows)}
            for name in names}

compile = load("compile.jsonl")
result = {"host": platform.platform(), "node": sys.argv[3], "revision": sys.argv[4]}
result["compileClock"] = "process CPU in a fresh QuickJS runtime"
result["compile"] = {}
for target in ("wasm", "rv32"):
    rows = [r for r in compile if r["target"] == target]
    artifact = json.loads((work / (target + ".json")).read_text())
    assert all(r["moduleBytes"] == artifact["moduleBytes"] for r in rows)
    result["compile"][target] = {"artifact": artifact, "samples": rows,
                                  "statistics": summary(rows, ("setupMs", "compileMs"))}
result["runtimeClock"] = "Node monotonic wall time inside the Wasm reactor; no scheduler, compositor or panel"
app = load("app.jsonl")
result["firstMove"] = {"samples": app, "statistics": summary(app, app[0])}
out.write_text(json.dumps(result, indent=2) + "\n")
PY
