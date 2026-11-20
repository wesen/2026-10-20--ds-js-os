#!/usr/bin/env bash
set -euo pipefail
if [[ $# -lt 6 ]]; then
  echo "usage: $0 WORK CPU wall|cpu reference|native fixed|quiet ROUNDS LANE..." >&2
  exit 2
fi
work=$1 cpu=$2 timer_clock=$3 provider=$4 policy=$5 rounds=$6
shift 6
if [[ $# -eq 0 || ! $rounds =~ ^[1-9][0-9]*$ || ! $timer_clock =~ ^(wall|cpu)$ ||
      ! $provider =~ ^(reference|native)$ || ! $policy =~ ^(fixed|quiet)$ ]]; then
  exit 2
fi
here=$(cd -- "$(dirname -- "$0")" && pwd)
root=$(git -C "$here" rev-parse --show-toplevel)
binary="$work/professor-$timer_clock"
if [[ $provider == native ]]; then binary="$work/professor-index-$timer_clock"; fi
out="$work/timing-$timer_clock-$provider-$policy"
mkdir -- "$out"
lanes=("$@")
quiet_start() {
  local ready=0 attempt one five fifteen processes newest
  for attempt in {1..120}; do
    read -r one five fifteen processes newest < /proc/loadavg
    if [[ $policy == fixed ]] || (( ${processes%/*} <= 3 )); then
      ((ready+=1))
      if [[ $policy == fixed ]] || ((ready == 2)); then
        printf '%s %s %s %s %s\n' "$one" "$five" "$fifteen" "$processes" "$newest"
        return
      fi
    else
      ready=0
    fi
    sleep 0.25
  done
  return 1
}
printf 'clock=%s provider=%s CPU=%s policy=%s\n' "$timer_clock" "$provider" "$cpu" "$policy" > "$out/environment.txt"
for ((trial=1; trial<=rounds; trial++)); do
  order=("${lanes[@]}")
  if ((trial % 2 == 0)); then
    order=()
    for ((i=${#lanes[@]}-1; i>=0; i--)); do order+=("${lanes[i]}"); done
  fi
  for lane in "${order[@]}"; do
    setup=$(quiet_start) || { printf '%s %s quiet start unavailable\n' "$lane" "$trial"; exit 2; }
    printf '%s %s %s\n' "$lane" "$trial" "$setup" >> "$out/starts.txt"
    taskset -c "$cpu" "$binary" "$work/$lane" "$work/editor.typed" \
        "$root/picocalc-os/build/typed-world-reactor.wasm" - "$work/professor.js" > "$out/$lane-$trial.txt"
    awk -v lane="$lane" -v trial="$trial" '/frontend only/ {printf "%s %s %s\n",lane,trial,$0}' "$out/$lane-$trial.txt"
  done
done | tee "$out/frontend-only.txt"
