#!/usr/bin/env bash
set -eu
work=$(realpath "$1")
capsule=$(realpath "$2")
fixtures=$(realpath "$3")
native=$(realpath "$4")
s=$(cd "$(dirname "$0")" && pwd)
day=$(cd "$s/../.." && pwd)
chess=( "$day"/PICOCALC-RENDER-CHESS--* )
snake=( "$day"/PICOCALC-RENDER-SNAKE--* )
python3 "$s/07-stage-board.py" "$work" --update --fixtures /tmp/chess-render-experiment/chess_fixtures.h --wasm /tmp/chess-render-experiment/view.wasm \
  --source "${chess[0]}/scripts/05-closed-view.typed" --capsule "snake=${snake[0]}/various/device-capsule.js" \
  --capsule sysmon=/tmp/render-system-board.js --capsule chess=/tmp/chess-render-experiment/chess-receive.js \
  --capsule reader=/tmp/pico-render-representation/reader.js --capsule "binary=$capsule"
python3 "${chess[0]}/scripts/15-stage-producer.py" "$work/tree" /tmp/chess-render-experiment
python3 "$s/13-stage-timing.py" "$work/tree"
python3 "$s/27-stage-native.py" "$work/tree" "$fixtures" "$native" "${@:5}"
