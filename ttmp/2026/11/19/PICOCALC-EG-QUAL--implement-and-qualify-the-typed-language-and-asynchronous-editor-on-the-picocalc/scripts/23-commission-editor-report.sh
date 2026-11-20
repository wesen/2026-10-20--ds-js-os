#!/usr/bin/env bash
# Commission the independent article once all twelve search outcomes are recorded.
set -euo pipefail
scratch=$1
scripts=$(cd "$(dirname "$0")" && pwd)
ticket=$(dirname "$scripts")
for ((i=0;i<1440;i++)); do
    if [[ -s "$ticket/sources/verified/editor.md" ]] &&
       jq -e '(.rows | length) == 6' "$ticket/various/search-comparison.json" >/dev/null 2>&1; then
        exec python3 -B "$scripts/01-opus-research.py" report "$scratch" --model claude-opus-4-6 \
          --lane editor --evidence "$ticket/sources/verified"
    fi
    sleep 5
done
exit 1
