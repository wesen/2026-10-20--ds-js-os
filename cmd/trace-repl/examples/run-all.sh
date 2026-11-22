#!/usr/bin/env bash
# Runs every example script in one fresh session and prints one line per script.
#   cmd/trace-repl/examples/run-all.sh                                  # service on the default address
#   TRACE_REPL=/tmp/trace-repl cmd/trace-repl/examples/run-all.sh --addr 127.0.0.1:3796
# Every argument is passed to open, eval and close. Examples 01-16 need only the archive;
# 17-25 also read the service's repository (by default the checkout it was started in).
# Example 24 writes the record example-opening-frame into the service's results directory.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
bin=${TRACE_REPL:-trace-repl}
sid=$("$bin" open "$@") || exit 1
trap '"$bin" close "$@" --session "$sid" >/dev/null' EXIT
failed=0
for script in "$here"/[0-9][0-9]-*.js; do
  name=$(basename "$script" .js)
  job=()
  case $name in 19-*) job=(--job --job-timeout 300) ;; esac   # the job pattern; wider sweeps outgrow a cell's 15 s
  if out=$("$bin" eval "$@" --session "$sid" "${job[@]}" < "$script" 2>&1); then
    printf 'ok    %s (%d bytes)\n' "$name" "${#out}"
  else
    printf 'FAIL  %s: %s\n' "$name" "${out:0:400}"
    failed=1
  fi
done
exit $failed
