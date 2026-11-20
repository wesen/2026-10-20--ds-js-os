#!/usr/bin/env bash
set -euo pipefail
work=$(realpath "$1")
gcc=$(realpath "$2")
emu=$(realpath "$3")
day=$(cd "$(dirname "$0")/../.." && pwd)
branch=("$day"/PICOCALC-RV32-BRANCH--*/scripts)
exam=("$day"/PICOCALC-RV32-STUDIES--*/scripts/examiner)
mkdir "$work/correctness"
mkdir "$work/correctness/pair"
ln -s "$work/lanes/base" "$work/correctness/pair/baseline"
ln -s "$work/lanes/both" "$work/correctness/pair/candidate"
node "$branch/04-differential.mjs" "$work/correctness/pair" > "$work/correctness/differential.json"
node "$exam/guest.mjs" "$gcc" "$emu" both "$work/lanes/both" > "$work/correctness/examiner.json"
python3 -B "$branch/05-guest.py" "$gcc" "$emu" "$work/correctness/pair" > "$work/correctness/workflows.json"
