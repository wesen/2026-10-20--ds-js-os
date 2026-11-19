#!/usr/bin/env python3
"""Run each Editor driver against a pair of modules with the same path and arguments."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile

p = argparse.ArgumentParser(description=__doc__)
p.add_argument("gcc", type=Path)
p.add_argument("emu", type=Path)
p.add_argument("modules", type=Path, help="directory created by cold-compiler.py --modules-out")
a = p.parse_args()
cc, emu = a.gcc.resolve(), a.emu.resolve()
root = Path(subprocess.check_output(["git","rev-parse","--show-toplevel"],text=True).strip())
script = next(root.glob("ttmp/2026/11/18/PICOCALC-TYPED-WORLDS--*/scripts/02-check-editor-world.mjs"))
modules = {label: (a.modules/(label+".elf")).read_bytes() for label in ("baseline","candidate")}
sha = lambda b: hashlib.sha256(b).hexdigest()
results = {}
for workload in ("--edit", "--large", "--preview-dense-inline", "--late-navigation"):
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        # The original fixture generator validates JS/Wasm screens and RV32 frames before returning its driver.
        setup = subprocess.run(["env",f"TMPDIR={tmp}","node",script,cc,emu,workload,"--keep-fixture"],
                               cwd=root, text=True, capture_output=True)
        if setup.returncode:
            raise RuntimeError(setup.stderr)
        driver, = work.glob("typed-editor-reactor-*/driver.elf")
        variant, = work.glob("typed-editor-reactor-*/editor.so")
        if variant.read_bytes() != modules["candidate"]:
            raise ValueError("fixture generator and timed compile disagree on candidate output")
        rows = {}
        for label, module in modules.items():
            (work/"editor.so").write_bytes(module)
            trace = subprocess.run(["env","RV32_STEPS=1",emu,driver,"editor.so"],cwd=work,capture_output=True,check=True)
            count = re.search(rb"rv32emu: (\d+) instructions",trace.stderr)
            if not count or not trace.stdout.rstrip().endswith(b"grant release passed"):
                raise RuntimeError("missing count or incomplete workload")
            rows[label] = {"instructions":int(count[1]), "output_sha256":sha(trace.stdout)}
        if rows["baseline"]["output_sha256"] != rows["candidate"]["output_sha256"]:
            raise ValueError("application outputs differ")
        results[workload] = {"driver_sha256":sha(driver.read_bytes()), "fixture":json.loads(setup.stdout),
                             "measurements":rows}
print(json.dumps({"metric":"all guest instructions from process start to exit; includes static driver, reactor and app",
                  "modules":{k:sha(v) for k,v in modules.items()}, "workloads":results},indent=2))
