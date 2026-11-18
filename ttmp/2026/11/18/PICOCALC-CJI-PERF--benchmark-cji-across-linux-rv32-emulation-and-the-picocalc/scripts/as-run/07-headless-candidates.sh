#!/usr/bin/env bash
# Continue the qualified control launched at 11:05. A stopped session is only a signal to inspect its receipts.
set -euo pipefail
root=/tmp/nov18-headless-ab
scripts=$(realpath "$(dirname "$0")/..")
while tmux has-session -t '=cji-headless-agenda-control' 2>/dev/null; do sleep 15; done
test -s "$root/control/p4-runs.jsonl"
bash "$scripts/24-board-candidates.sh" "$root" guard join memo
