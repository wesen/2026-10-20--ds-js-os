#!/usr/bin/env bash
# Build every firmware profile at HEAD, one after another (the CJI bootstrap writes into its source tree, so builds
# of one checkout cannot run at once), and the playable profile a second time in another directory to check that it
# is reproducible. Prints one line per build: profile, commit, dirty, app digest.
# usage (repository root): ttmp/.../scripts/05-build-profiles.sh [TAG]
set -uo pipefail
tag=${1:-$(git rev-parse --short HEAD)}
source "${IDF_EXPORT:-$HOME/esp/esp-idf-5.4.2/export.sh}" > /dev/null 2>&1
for profile in playable playable-again bench candela-world offline agent agent-elf; do
    name=${profile%-again}
    out=/tmp/picocalc-typed-app-manifest-$profile-$tag
    if firmware/port/esp32p4/build.sh "$name" "$out" > "$out.log" 2>&1; then
        tail -1 "$out.log" | sed "s|^|$profile: |"
    else
        echo "$profile: FAILED (see $out.log)"
        grep -E "error:|FAILED|Error" "$out.log" | head -5
    fi
done
