#!/usr/bin/env bash
# The reference Node frontend and the memory-capped compiled frontend may fail at different phases.
set -euo pipefail
base=$(realpath "${1:?control stage1}")
guard=$(realpath "${2:?guarded stage1}")
out=$(realpath -m "${3:?receipt directory}")
mkdir -p "$out"
for source in apps/calc.js system/sandbox.js; do
    name=$(basename "$source" .js)
    mib=8
    if [[ $name == calc ]]; then mib=10; fi
    cap=$((mib * 1024 * 1024))
    for variant in control guard; do
        exe="$base"
        if [[ $variant == guard ]]; then exe="$guard"; fi
        if "$exe" -g -C -h "$cap" -H "$cap" -- "picocalc-os/js/$source" --world-unit \
            > "$out/$name-$variant.ir" 2> "$out/$name-$variant.log"; then
            echo "Unexpected acceptance: $name $variant" >&2; exit 1
        else
            echo "$?" > "$out/$name-$variant.status"
        fi
    done
    cmp "$out/$name-control.status" "$out/$name-guard.status"
    if [[ $name == calc ]]; then
        for variant in control guard; do grep -F 'out of memory:' "$out/$name-$variant.log"; done
    else
        for variant in control guard; do grep -F '15:13: expected ), found ,' "$out/$name-$variant.log"; done
    fi
done
