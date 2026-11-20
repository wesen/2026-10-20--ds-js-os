#!/usr/bin/env bash
# Send only reviewed aggregate evidence for the independent hardware interpretation.
set -euo pipefail
work=$1
scripts=$(cd "$(dirname "$0")" && pwd)
ticket=$(dirname "$scripts")
for ((i=0;i<1440;i++)); do
    if jq -e '.restored and (.lanes["index-reuse"].boots|length==3)' "$work/index-cold/physical.json" >/dev/null 2>&1; then
        python3 -B "$scripts/13-compare-physical-index.py" "$work" "$ticket/various/physical-comparison.json"
        {
            cat <<'TEXT'
This is a staged experiment. Production selection awaits the full application gates. The four native Editor arms below are measured on one physical ESP32-P4. Each time is a median of three fresh compiles; power-on and explicit reboots are deduplicated. The cap is 4 MiB of compiler heap. Native output size includes a fixed reserved code slot plus reactor. The previous async compiler has identical app behavior and emitted bytes to both indexed arms. The manual control uses an earlier compiler and source. Exact byte equality for the three apps was checked across the staged async compiler arms on the host. Lexical symbol IDs denote spellings including identifier spellings; semantics and binding identities are determined separately. The native index declines ambiguous trailing comments or unsupported input and frees its temporary state on out-of-memory. The ordinary scanner handles a decline. The optional internal token reuse is separate from spelling interning. Do not report an improvement as a production change. The original independent design's proposed exemption for identifier spellings was unnecessary. Do not include simulated tool calls. Return only the article and your diary.
TEXT
            jq '{ceiling_us, arms: (.arms|map_values(del(.image_sha256,.staged_sources)))}' "$ticket/various/physical-comparison.json"
            cat "$ticket/various/01-js-cursor-oracle.json" "$ticket/various/producer-differential.json"
        } > "$work/index-cold/independent-evidence.txt"
        exec python3 -B "$scripts/05-opus-lex.py" report "$work/empty" --evidence "$work/index-cold/independent-evidence.txt"
    fi
    sleep 5
done
exit 1
