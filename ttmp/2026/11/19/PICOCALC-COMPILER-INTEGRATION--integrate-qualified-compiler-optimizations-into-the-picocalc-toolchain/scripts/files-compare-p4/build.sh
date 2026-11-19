#!/usr/bin/env bash
set -euo pipefail
if [[ $# -lt 3 || $# -gt 4 ]]; then
    echo "usage: build.sh OLD_REV NEW_REV /tmp/WORK_DIRECTORY [--smoke]" >&2
    exit 2
fi
old=$1
new=$2
work=$(realpath -m "$3")
case "$work" in /tmp/*) ;; *) echo "Use a build directory below /tmp" >&2; exit 2;; esac
here=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$work/main"
cp "$here/CMakeLists.txt" "$here/sdkconfig.defaults" "$work/"
cp "$here/main/"{CMakeLists.txt,measure.c} "$work/main/"
node "$here/generate.mjs" "$old" "$new" "$work" "${4:-}"
cd "$work"
idf.py -D IDF_TARGET=esp32p4 build
python3 "$here/check-elf.py" "$work"
