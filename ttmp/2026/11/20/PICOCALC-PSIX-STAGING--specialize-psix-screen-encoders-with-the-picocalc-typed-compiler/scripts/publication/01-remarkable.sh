#!/usr/bin/env bash
set -euo pipefail

ticket=$(cd "$(dirname "$0")/../.." && pwd)
destination=/ai/2026/11/20/PICOCALC-PSIX-STAGING

case "${1:-}" in
    design)
        name='PicoCalc PSIX Specialization Designs'
        docs=(
            "$ticket/design-doc/01-a-staged-compiler-for-psix-screen-encoders.md"
            "$ticket/design-doc/02-static-emitter.md"
            "$ticket/design-doc/03-observed-shapes.md"
            "$ticket/design-doc/04-staging-and-binding.md"
            "$ticket/design-doc/07-independent-experimental-design.md"
        )
        ;;
    results)
        name='PicoCalc PSIX Specialization Results'
        docs=(
            "$ticket/analysis/01-compiling-the-screen-writer-on-a-handheld.md"
            "$ticket/analysis/02-static-encoder.md"
            "$ticket/analysis/03-observed-shapes.md"
            "$ticket/analysis/04-staging-and-binding.md"
            "$ticket/analysis/07-independent-specialization-results.md"
        )
        ;;
    *)
        printf 'usage: %s design|results\n' "$0" >&2
        exit 2
        ;;
esac

exec remarquee upload bundle "${docs[@]}" --name "$name" --remote-dir "$destination" \
    --toc-depth 2 --non-interactive
