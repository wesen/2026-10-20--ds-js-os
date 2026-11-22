#!/usr/bin/env bash
# 07-run-kernel.sh: run one Candela preset's own kernel as C++ on the host and as RV32IMAFC code in the
# counting interpreter, and record instructions per camera sample.
#
#   07-run-kernel.sh <candela-root> <work-dir> <preset> <width> <height> <spp> <gcc-opt> [extra g++ flags]
#
# Steps: 03-export-scene.mjs (Candela's build, compile and pack in Node) -> 04-wgsl2cpp.mjs (the
# generated WGSL to C++) -> a native build of 05-harness.cpp (reference frame) -> an ESP GCC build for
# rv32imafc/ilp32f (the multilib the PicoCalc firmware links against) -> 06-rv32imfc-count (counts and
# per-function profile) -> 08-tonemap-png.py (preview and host-vs-RV32 comparison). A second RV32 build
# with -DBASELINE (no pixels) is subtracted, so the count is the frame alone.
# Prints one JSON line on stdout; everything else goes to <work-dir>/<preset>/.
set -euo pipefail
root=$1 work=$2 preset=$3 W=$4 H=$5 SPP=$6 OPT=$7; shift 7
here=$(cd "$(dirname "$0")" && pwd)
GXX=${GXX:-/home/manuel/.espressif/tools/riscv32-esp-elf/esp-14.2.0_20260121/riscv32-esp-elf/bin/riscv32-esp-elf-g++}
COUNT=${COUNT:-$work/rv32imfc-count}
d=$work/$preset; mkdir -p "$d"
[ -x "$COUNT" ] || gcc -O2 -o "$COUNT" "$here/06-rv32imfc-count.c" -lm
node "$here/03-export-scene.mjs" "$root" "$preset" "$W" "$H" "$d" >&2
node "$here/04-wgsl2cpp.mjs" "$d/kernel.wgsl" "$d/kernel.cpp" >&2
tag="${W}x${H}-s${SPP}${OPT}$(printf '%s' "$*" | tr -d ' =')"
g++ -std=c++17 -O2 -fno-math-errno -w -DSPP="$SPP" -DKERNEL="\"$d/kernel.cpp\"" "$here/05-harness.cpp" -o "$d/host-$tag.exe"
"$d/host-$tag.exe" "$d/scene.bin" "$d/host-$tag.rgbf"
printf '.section .rodata\n.global cdl_scene\n.balign 16\ncdl_scene:\n.incbin "%s"\n' "$d/scene.bin" > "$d/scene.S"
flags=(-march=rv32imafc_zicsr_zifencei -mabi=ilp32f "$OPT" -fno-math-errno -fno-exceptions -fno-rtti -fno-threadsafe-statics -w
       -msmall-data-limit=0 -mno-relax -nostartfiles -static -Wl,-Ttext=0x10000 -Wl,-e,_start -DSPP="$SPP" -DKERNEL="\"$d/kernel.cpp\"" "$@")
"$GXX" "${flags[@]}" "$here/05-harness.cpp" "$d/scene.S" -o "$d/rv32-$tag.elf" -lm -lc -lgcc 2>/dev/null
"$GXX" "${flags[@]}" -DBASELINE "$here/05-harness.cpp" "$d/scene.S" -o "$d/rv32-$tag-base.elf" -lm -lc -lgcc 2>/dev/null
"$COUNT" "$d/rv32-$tag.elf" "$d/rv32-$tag.rgbf" "$d/rv32-$tag.prof.tsv" 2> "$d/rv32-$tag.count.txt"
"$COUNT" "$d/rv32-$tag-base.elf" /dev/null 2> "$d/rv32-$tag-base.count.txt"
python3 -I "$here/08-tonemap-png.py" "$W" "$H" "$d/rv32-$tag.rgbf" "$d/rv32-$tag.png" "$d/host-$tag.rgbf" > "$d/rv32-$tag.compare.txt"
python3 -I "$here/08-tonemap-png.py" "$W" "$H" "$d/host-$tag.rgbf" "$d/host-$tag.png" > /dev/null
size=$("${GXX%g++}size" -A "$d/rv32-$tag.elf" | awk '$1==".text"{print $2}')
python3 -I - "$d" "$tag" "$preset" "$W" "$H" "$SPP" "$OPT" "$size" <<'EOF'
import json, sys
d, tag, preset, W, H, spp, opt, size = sys.argv[1:9]
def counts(p): return json.loads([l for l in open(p) if l.startswith('{')][0])
run, base = counts(f"{d}/rv32-{tag}.count.txt"), counts(f"{d}/rv32-{tag}-base.count.txt")
frame = {k: run[k] - base.get(k, 0) for k in run}
samples = int(W) * int(H) * int(spp)
cmp = open(f"{d}/rv32-{tag}.compare.txt").read().strip().splitlines()[-1]
print(json.dumps({"preset": preset, "width": int(W), "height": int(H), "spp": int(spp), "opt": opt, "textBytes": int(size),
                  "frameInstructions": frame["instructions"], "perSample": round(frame["instructions"] / samples, 1),
                  "classesPerSample": {k: round(v / samples, 1) for k, v in frame.items() if k != "instructions"},
                  "hostVsRv32": cmp}))
EOF
