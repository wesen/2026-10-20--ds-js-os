#!/usr/bin/env bash
# 13-count-entry-calls.sh: how often one camera sample enters the kernel's per-scene code (evalMaterial,
# sdUser, heightAt, densityOf, customKernel) and its traversal (traceAll, occluded), on the host.
#
#   13-count-entry-calls.sh <work-dir-of-07-run-kernel> <preset> [W H]
#
# Instruments the translated kernel.cpp (a counter at the top of each definition) and runs 1 spp.
set -euo pipefail
work=$1 p=$2 W=${3:-160} H=${4:-160}
here=$(cd "$(dirname "$0")" && pwd)
out=$work/callcount; mkdir -p "$out"
python3 -I - "$work/$p/kernel.cpp" "$out/$p.cpp" <<'EOF'
import re, sys
s = open(sys.argv[1]).read()
names = ["evalMaterial", "sdUser", "heightAt", "densityOf", "customKernel", "traceAll", "occluded", "tracePath"]
for i, n in enumerate(names):
    pat = re.compile(r"(static [\w:<> ]+? " + n + r"\([^;{]*\)\s*\{)")
    s = pat.sub(lambda m: m.group(1) + f" CALLS[{i}]++;", s, count=1)
s = s.replace("namespace cdl {", "namespace cdl {\nextern unsigned long long CALLS[8];", 1)
open(sys.argv[2], "w").write(s + "\nnamespace cdl { unsigned long long CALLS[8]; }\n")
EOF
g++ -std=c++17 -O1 -fno-math-errno -w -DSPP=1 -DKERNEL="\"$out/$p.cpp\"" -o "$out/$p.exe" -x c++ - <<EOF
#define main harness_main
#include "$here/05-harness.cpp"
#undef main
#include <cstdio>
int main(int c, char **v) { int r = harness_main(c, v); const char *n[8] = {"evalMaterial","sdUser","heightAt","densityOf","customKernel","traceAll","occluded","tracePath"};
  for (int i = 0; i < 8; i++) if (cdl::CALLS[i]) fprintf(stderr, "$p %s %.3f per sample\n", n[i], cdl::CALLS[i] / double($W * $H)); return r; }
EOF
"$out/$p.exe" "$work/$p/scene.bin" /dev/null
