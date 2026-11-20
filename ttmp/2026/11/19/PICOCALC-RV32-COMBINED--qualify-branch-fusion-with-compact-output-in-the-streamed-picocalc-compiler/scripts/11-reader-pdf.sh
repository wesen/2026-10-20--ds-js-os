#!/usr/bin/env bash
# Render the frozen Markdown bundle without contacting the publication service.
set -euo pipefail
reader=$1
output=$2
tmp=$(mktemp -d)
cat > "$tmp/header.tex" <<'TEX'
\usepackage{fvextra}
\RecustomVerbatimEnvironment{verbatim}{Verbatim}{breaklines=true,breakanywhere=true,fontsize=\small}
TEX
pandoc "$reader/01-guide.md" "$reader/02-report.md" --standalone --toc --toc-depth=2 \
  --pdf-engine=xelatex --no-highlight --include-in-header "$tmp/header.tex" \
  -M title="PicoCalc RV32 Combined Compiler Trial" -V geometry:margin=0.8in \
  -V 'mainfont=DejaVu Sans' -V 'monofont=DejaVu Sans Mono' -o "$output"
