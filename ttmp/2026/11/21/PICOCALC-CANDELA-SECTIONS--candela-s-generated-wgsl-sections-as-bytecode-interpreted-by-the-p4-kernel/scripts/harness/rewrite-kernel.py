#!/usr/bin/env python3
"""rewrite-kernel.py: prepare PICOCALC-CANDELA-P4's prototype C++ translation (04-wgsl2cpp.mjs output) for the
three-mode harness (harness.cpp).

usage: python3 -I rewrite-kernel.py kernel.cpp out.cpp

The five dispatch functions (evalMaterial, sdUser, heightAt, densityOf, customKernel) are renamed to
<name>_compiled in their prototype and definition; a prototype of <name> itself is kept, so every call in the fixed
kernel now reaches the harness's wrapper of that name, which runs the compiled function, the interpreter, or both.
Fails unless each function has exactly one prototype and one definition."""
import re
import sys

NAMES = ["evalMaterial", "sdUser", "heightAt", "densityOf", "customKernel"]
src = open(sys.argv[1]).read()
for n in NAMES:
    proto = re.compile(r"^(static [\w:<>&]+ )" + n + r"(\([^;{]*\));$", re.M)
    defn = re.compile(r"^(static [\w:<>&]+ )" + n + r"(\([^;{]*\)\s*\{)", re.M)
    if len(proto.findall(src)) != 1 or len(defn.findall(src)) != 1:
        sys.exit(f"rewrite-kernel: expected one prototype and one definition of {n}")
    src = proto.sub(lambda m: f"{m.group(1)}{n}_compiled{m.group(2)};\n{m.group(1)}{n}{m.group(2)};", src)
    src = defn.sub(lambda m: f"{m.group(1)}{n}_compiled{m.group(2)}", src)
open(sys.argv[2], "w").write(src)
