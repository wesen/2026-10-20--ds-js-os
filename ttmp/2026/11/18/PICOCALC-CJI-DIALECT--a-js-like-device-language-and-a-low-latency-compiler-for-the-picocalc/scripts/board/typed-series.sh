#!/usr/bin/env bash
set -euo pipefail
out=${1:?new directory}
image=${2:?typed emitter probe}
control=${3:?ordinary headless snapshot}
p=(ttmp/2026/11/18/*CJI-PERF*/scripts)
port=/dev/serial/by-id/usb-1a86_USB_Single_Serial_5B61091051-if00
mkdir "$out"
trap 'bash "$p/18-headless-smoke.sh" "$out/restored" "$control"' EXIT
sha256sum --check --status "$image/identities.sha256"
bash "$p/18-headless-smoke.sh" "$out/probe" "$image"
python3 picocalc-os/tools/p4cap.py -p "$port" --no-reset -s 9 -c '0.5 bench' -c '3 bench' -c '5.5 bench' > "$out/typed-uart.log"
python3 "$(dirname "$0")/verify-typed.py" "$out/typed-uart.log"
