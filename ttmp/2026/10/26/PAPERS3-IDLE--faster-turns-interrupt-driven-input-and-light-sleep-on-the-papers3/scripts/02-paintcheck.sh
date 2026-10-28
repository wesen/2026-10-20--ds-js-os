#!/bin/sh
# Run every PaperS3 tour (plus the stress script beside this file) with the compositor's paint check on: each
# retained paint is followed by a full paint, and any difference is logged. Prints one summary line per script.
#   cd picocalc-os && make BOARD=papers3 && sh ../ttmp/2026/10/26/PAPERS3-IDLE-*/scripts/02-paintcheck.sh
set -e
here=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d)
for f in scripts-papers3/*.txt "$here/02-paintcheck-stress.txt"; do
  b=$(basename "$f" .txt)
  case "$b" in 02-*) cp "$f" "$tmp/$b.txt" ;;
    *) { echo "wait 50"; echo "send compositor paintcheck {}"; cat "$f"; echo 'send compositor paintcheck {"report":true}'; echo "wait 100"; } > "$tmp/$b.txt" ;; esac
  ./build-papers3/papers3-host -j js-papers3 -o "$tmp" -u "$tmp/$b.uart" "$tmp/$b.txt" > "$tmp/$b.log" 2>&1
  echo "$b: $(grep -h 'paint check' "$tmp/$b.uart" | tail -1)"
done
rm -rf "$tmp"
