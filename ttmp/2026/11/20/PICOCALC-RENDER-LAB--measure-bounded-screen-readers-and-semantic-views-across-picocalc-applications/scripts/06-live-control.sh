#!/usr/bin/env bash
set -eu
here=$(cd "$(dirname "$0")" && pwd)
exec flock -w 15 /tmp/pico-lab2-wave/original/serial.lock python3 "$here/05-live-control.py" "$@"
