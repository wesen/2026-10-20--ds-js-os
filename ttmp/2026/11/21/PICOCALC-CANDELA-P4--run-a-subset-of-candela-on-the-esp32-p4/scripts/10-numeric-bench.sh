#!/usr/bin/env bash
# 10-numeric-bench.sh: instructions per call (RV32, counted) and accuracy (host, against double precision)
# of three Candela kernels in five numeric models (09-numeric-bench.c), and libm costs (11-libm-cost.c).
#
#   10-numeric-bench.sh <work-dir> <out.jsonl>
#
# RV32 builds: F32 and VM for rv32imafc/ilp32f; SOFT, Q16 and Q16T for rv32imc/ilp32 (no FPU needed).
# All with GCC -O2 from the ESP toolchain. Each count subtracts a -DBASELINE build of the same arm.
set -euo pipefail
work=$1 out=$2
here=$(cd "$(dirname "$0")" && pwd)
GCC=${GCC:-/home/manuel/.espressif/tools/riscv32-esp-elf/esp-14.2.0_20260121/riscv32-esp-elf/bin/riscv32-esp-elf-gcc}
COUNT=${COUNT:-$work/rv32imfc-count}
mkdir -p "$work/num"; cd "$work/num"
[ -x "$COUNT" ] || gcc -O2 -o "$COUNT" "$here/06-rv32imfc-count.c" -lm
common=(-O2 -fno-math-errno -w -msmall-data-limit=0 -mno-relax -nostartfiles -static -Wl,-Ttext=0x10000 -Wl,-e,_start)
march() { case $1 in 1|5) echo "-march=rv32imafc_zicsr_zifencei -mabi=ilp32f";; *) echo "-march=rv32imc_zicsr_zifencei -mabi=ilp32";; esac; }
: > "$out"
for K in 1 2 3; do
  gcc -O2 -fno-math-errno -w -DKERN=$K -DARM=0 "$here/09-numeric-bench.c" -o ref-$K.exe && ./ref-$K.exe > ref-$K.bin
  for A in 1 2 3 4 5; do
    gcc -O2 -fno-math-errno -w -DKERN=$K -DARM=$A "$here/09-numeric-bench.c" -o host-$K-$A.exe && ./host-$K-$A.exe > host-$K-$A.bin
    # shellcheck disable=SC2046
    "$GCC" $(march $A) "${common[@]}" -DKERN=$K -DARM=$A "$here/09-numeric-bench.c" -o rv-$K-$A.elf -lm -lc -lgcc
    # shellcheck disable=SC2046
    "$GCC" $(march $A) "${common[@]}" -DKERN=$K -DARM=$A -DBASELINE "$here/09-numeric-bench.c" -o rv-$K-$A-base.elf -lm -lc -lgcc
    "$COUNT" rv-$K-$A.elf rv-$K-$A.bin 2> rv-$K-$A.txt; "$COUNT" rv-$K-$A-base.elf /dev/null 2> rv-$K-$A-base.txt
    python3 -I - "$K" "$A" >> "$out" <<'EOF'
import json, struct, sys
K, A = sys.argv[1], int(sys.argv[2])
N = 2000
def cnt(p): return json.loads([l for l in open(p) if l.startswith('{')][0])
run, base = cnt(f"rv-{K}-{A}.txt"), cnt(f"rv-{K}-{A}-base.txt")
per = {k: round((run[k] - base.get(k, 0)) / N, 2) for k in run}
ref = struct.unpack(f"<{N}d", open(f"ref-{K}.bin", "rb").read())
def dec(path):
    raw = open(path, "rb").read()
    if A in (3, 4):
        return [None if v == 0x7fffffff else v / 65536.0 for v in struct.unpack(f"<{N}i", raw)]
    return [None if v >= 1e29 else v for v in struct.unpack(f"<{N}f", raw)]
def accuracy(vals):
    miss = sum(1 for r, v in zip(ref, vals) if (r >= 1e29) != (v is None))
    rel = [abs(v - r) / max(abs(r), 1e-6) for r, v in zip(ref, vals) if r < 1e29 and v is not None]
    rel.sort()
    return {"hitMissDisagree": miss, "compared": len(rel), "medianRelErr": rel[len(rel) // 2] if rel else None,
            "p99RelErr": rel[int(len(rel) * 0.99)] if rel else None, "maxRelErr": rel[-1] if rel else None,
            "within1e-3": round(sum(1 for e in rel if e <= 1e-3) / max(len(rel), 1), 4)}
names = {1: "F32", 2: "SOFT", 3: "Q16", 4: "Q16T", 5: "VM"}
kern = {"1": "SPHERE", "2": "GGX", "3": "NORM"}[K]
print(json.dumps({"kernel": kern, "arm": names[A], "perCall": per["instructions"], "classesPerCall": {k: v for k, v in per.items() if k != "instructions" and v},
                  "hostAccuracy": accuracy(dec(f"host-{K}-{A}.bin")), "rv32Accuracy": accuracy(dec(f"rv-{K}-{A}.bin"))}))
EOF
  done
done
# libm costs per call (rv32imafc/ilp32f newlib)
for F in 0 1 2 3 4 5 6 7 8 9 10 11; do
  # shellcheck disable=SC2046
  "$GCC" $(march 1) "${common[@]}" -DFN=$F "$here/11-libm-cost.c" -o libm-$F.elf -lm -lc -lgcc 2>/dev/null
  "$COUNT" libm-$F.elf /dev/null 2> libm-$F.txt
done
python3 -I - >> "$out" <<'EOF'
import json
def cnt(p): return json.loads([l for l in open(p) if l.startswith('{')][0])
base = cnt("libm-0.txt")["instructions"]
names = ["", "expf", "logf", "powf", "cosf(2pi u)", "sinf(2pi u)", "sinf(large: hash13)", "acosf", "atan2f", "floorf", "sqrtf", "tanf"]
print(json.dumps({"libmPerCall": {names[f]: round((cnt(f"libm-{f}.txt")["instructions"] - base) / 4000, 1) for f in range(1, 12)}}))
EOF
cat "$out"
