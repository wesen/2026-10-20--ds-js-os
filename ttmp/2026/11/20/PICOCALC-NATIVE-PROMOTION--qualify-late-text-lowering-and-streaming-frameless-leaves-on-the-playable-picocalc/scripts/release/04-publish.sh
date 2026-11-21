#!/usr/bin/env bash
# Stage the four newcomer reports and their figures. Pass --publish to commit, push and verify main.
set -euo pipefail
if (( $# < 1 || $# > 2 )); then echo 'usage: 04-publish.sh STAGE [--publish]' >&2; exit 2; fi
if (( $# == 2 )) && [[ $2 != --publish ]]; then echo 'expected --publish' >&2; exit 2; fi
ticket=$(cd "$(dirname "$0")/../.." && pwd)
previous=("$ticket"/../PICOCALC-NATIVE-WAVE--*/scripts/director/12-publish-vault.py)
exec python "${previous[0]}" --ticket "$ticket" --series 'Native Compiler Promotion' --count 4 "$@"
