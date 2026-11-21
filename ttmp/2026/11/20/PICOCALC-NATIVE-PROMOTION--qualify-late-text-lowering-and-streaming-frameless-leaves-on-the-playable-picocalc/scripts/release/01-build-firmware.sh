#!/usr/bin/env bash
# Build one historical or promoted revision of the ordinary playable profile.
set -eo pipefail
if (( $# != 3 && $# != 4 )); then
    echo "usage: 01-build-firmware.sh REV NEW_STAGE IDF_EXPORT_SH [MANAGED_COMPONENTS]" >&2
    exit 2
fi
repo=$(git rev-parse --show-toplevel)
revision=$(git -C "$repo" rev-parse --verify "$1^{commit}")
work=$(realpath -m -- "$2")
export_script=$(realpath -- "$3")
mkdir -- "$work"
mkdir -- "$work/tree"
git -C "$repo" archive "$revision" cji picocalc-os | tar -xC "$work/tree"
port="$work/tree/picocalc-os/port/esp32p4"
if (( $# == 4 )); then
    cp -R -- "$4" "$port/managed_components"
fi
echo "$revision" > "$work/revision"
source "$export_script"
bash "$port/build-smooth-chess.sh" "$work/build"
ln -s "$work/build/sdkconfig.smooth-chess" "$work/sdkconfig"
