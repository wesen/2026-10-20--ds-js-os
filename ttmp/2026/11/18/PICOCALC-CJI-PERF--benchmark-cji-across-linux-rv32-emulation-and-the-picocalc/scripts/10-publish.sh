#!/usr/bin/env bash
# A new cloud title preserves the earlier design-only PDF and its annotations.
set -euo pipefail
ticket=$(realpath "$(dirname "$0")/..")
remarquee upload bundle "$ticket"/analysis/01-*.md "$ticket"/design-doc/01-*.md \
  --resolve-images --name 'PicoCalc CJI Performance Measurements and Optimization Plan' \
  --remote-dir '/ai/2026/11/18/PICOCALC-CJI-PERF' --toc-depth 2 --non-interactive
