#!/usr/bin/env bash
# Build a firmware profile (profiles/<name>.env) after sourcing the ESP-IDF v5.4.2 environment.
#
#   firmware/port/esp32p4/build.sh playable /tmp/picocalc-playable [-D OPTION=VALUE ...]
#
# Extra -D arguments go to idf.py after the profile's options. Writes BUILD/picocalc-build.json: the profile, the
# commit and whether the tree was dirty, the options, and the app and partition-table digests. Install the playable
# build with bench/board/playable.py install BUILD OUT.
set -euo pipefail
if [[ $# -lt 2 ]]; then
    echo "usage: build.sh PROFILE BUILD_DIRECTORY [-D OPTION=VALUE ...]   profiles: $(cd "$(dirname "$0")/profiles" && ls *.env | sed 's/\.env$//' | tr '\n' ' ')" >&2
    exit 2
fi
port=$(cd "$(dirname "$0")" && pwd)
profile=$1
build=$(realpath -m "$2")
shift 2
[[ -f $port/profiles/$profile.env ]] || { echo "no profile $profile in $port/profiles" >&2; exit 2; }
source "$port/profiles/$profile.env"
idf_version=$(idf.py --version)
if [[ "$idf_version" != "ESP-IDF v5.4.2" ]]; then
    echo "expected ESP-IDF v5.4.2, found $idf_version" >&2
    exit 2
fi
defaults=
for f in "${SDKCONFIG_DEFAULTS[@]}"; do defaults+="${defaults:+;}$port/$f"; done
defines=()
for o in "${OPTIONS[@]}"; do defines+=(-D "$o"); done
# The commit and dirty state of the sources the build starts from (a later edit must not be recorded as built).
commit=$(git -C "$port" rev-parse --short HEAD)
dirty=false; git -C "$port" diff --quiet HEAD -- || dirty=true
mkdir -p "$build"
config=$build/sdkconfig.$SDKCONFIG_NAME
idf.py -C "$port" -B "$build" -D "SDKCONFIG=$config" -D "SDKCONFIG_DEFAULTS=$defaults" \
    "${defines[@]}" "$@" build
app=$(sha256sum "$build/picocalc-os-p4.bin" | cut -d' ' -f1)
part=$(sha256sum "$build/partition_table/partition-table.bin" | cut -d' ' -f1)
extra=$(printf '%s\n' "$@" | python3 -c 'import json,sys; print(json.dumps([l for l in sys.stdin.read().splitlines() if l]))')
cat > "$build/picocalc-build.json" <<JSON
{"profile": "$profile", "commit": "$commit", "dirty": $dirty, "options": $(printf '%s\n' "${OPTIONS[@]}" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().split()))'),
 "extra": $extra, "app": "$app", "partitionTable": "$part"}
JSON
echo "$profile $commit dirty=$dirty app $app"
