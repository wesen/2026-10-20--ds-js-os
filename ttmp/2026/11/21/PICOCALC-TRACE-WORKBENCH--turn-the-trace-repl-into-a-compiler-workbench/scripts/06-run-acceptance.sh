#!/usr/bin/env bash
# Run the REPL-native replacements of the PICOCALC-RAY-PARITY drivers against a running
# service and save each result under the ticket's various/. Only the trace-repl CLI is used:
# no Python client, no chunked bindings, no one-input-per-cell loop.
#
# usage: 06-run-acceptance.sh ADDR
#   The service must have been started with --repo pointing at a checkout that has
#   RAY-PARITY's various/13-board/ (the board rows) and a --max-job of at least 30m, e.g.
#   trace-repl serve --addr 127.0.0.1:3811 --archive <ROW-IR ticket> --repo <checkout> --max-job 30m
# TRACE_REPL overrides the client command (default: go run ./cmd/trace-repl, from the repo root).
set -euo pipefail
addr=${1:?usage: 06-run-acceptance.sh ADDR}
here=$(cd "$(dirname "$0")" && pwd)
out=$(dirname "$here")/various
mkdir -p "$out"
read -r -a tr <<<"${TRACE_REPL:-go run ./cmd/trace-repl}"

sid=$("${tr[@]}" open --addr "$addr")
trap '"${tr[@]}" close --addr "$addr" --session "$sid" || true' EXIT
pretty() { python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin), indent=1))'; }

"${tr[@]}" info --addr "$addr" >"$out/00-service-info.json"
"${tr[@]}" eval --addr "$addr" --session "$sid" <"$here/02-open-compiler-session.js" | pretty >"$out/01-open-compiler-session.json"
"${tr[@]}" eval --addr "$addr" --session "$sid" --job --job-timeout 1800 <"$here/03-planner-equivalence.js" | pretty >"$out/02-planner-equivalence-eaf0872-3213028.json"
"${tr[@]}" eval --addr "$addr" --session "$sid" --job --job-timeout 1800 <"$here/04-compile-cost.js" | pretty >"$out/03-compile-cost-goja.json"
"${tr[@]}" eval --addr "$addr" --session "$sid" <"$here/05-score-board.js" | pretty >"$out/04-board-scores.json"
echo "results in $out"
