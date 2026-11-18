#!/usr/bin/env bash
# Select inclusive counts for named, non-recursion-suffixed symbols in the guarded compiler.
set -euo pipefail
source_dir=${1:?script 10 output}
dest=${2:?ticket evidence directory}
for world in agenda files; do
    grep -E 'PROGRAM TOTALS|:\??(inferTypes|analyzeRanges|instantiateLibraryTaking|slice|stSet|join)\.[a-f0-9]+ \[' "$source_dir/$world.txt" > "$dest/$world-inclusive.txt"
    grep -q ':analyzeRanges\.' "$dest/$world-inclusive.txt"
done
