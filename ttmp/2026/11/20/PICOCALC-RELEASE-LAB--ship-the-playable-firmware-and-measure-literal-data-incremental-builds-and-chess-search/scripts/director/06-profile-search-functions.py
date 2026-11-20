"""Attribute modeled guest instructions to Typed functions on four individual workloads.

Inputs are a directory produced by scripts/chess/prepare.mjs, the study's modeled.json,
and the path to the ESP RV32 C compiler. The profiler runs entirely on the host.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import struct
import subprocess
import tempfile

here = Path(__file__).resolve().parent
root = next(p for p in here.parents if (p / ".git").exists())
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("fixture", type=Path)
parser.add_argument("modeled", type=Path)
parser.add_argument("gcc", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
assert args.output.suffix == ".json"
host = json.loads((args.fixture / "host.json").read_text())
original = json.loads(args.modeled.read_text())
assert original["digest"] == host["digest"]
node = """
const fs = require('node:fs'), vm = require('node:vm'), crypto = require('node:crypto');
const read = p => fs.readFileSync('picocalc-os/' + p, 'utf8');
for (const f of ['typed-wasm','typed-rv32']) vm.runInThisContext(read('compiler/'+f+'.js'));
const src = ['state','position','moves','search'].map(n => read('worlds/chess/'+n+'.typed')).join('\\n');
const program = typedRv32.compile(src);
console.log(JSON.stringify({digest:crypto.createHash('sha256').update(program.image).digest('hex'),
                            entries:program.entries}));
"""
identity = json.loads(subprocess.check_output(["node", "-e", node], cwd=root))
assert identity["digest"] == host["rv32Sha256"]
assert hashlib.sha256((args.fixture / "engine.bin").read_bytes()).hexdigest() == identity["digest"]
keys = ["bestMove", "score", "completed", "nodes", "slices"]
# Opening d4, tactical Kiwipete d4, pawn ending d5 and the actual interactive budget.
chosen = [("opening", 4, 30000), ("kiwipete", 4, 30000),
          ("pawn-ending", 5, 30000), ("after-e2e4", 4, 1600)]
asm = ['.section .text.chess_benchmark,"ax"', ".balign 4", "engine_start:", '.incbin "engine.bin"']
for name, offset in identity["entries"].items():
    asm.extend([f".global {name}", f".type {name},@function", f".set {name},engine_start+{offset}"])
control = (here.parent / "chess/model.c").read_text()
loop = "i = 0; i < sizeof(cases) / sizeof(cases[0]); ++i"
assert control.count(loop) == 1
observations = []
with tempfile.TemporaryDirectory(prefix="pico-chess-func-profile-") as directory:
    work = Path(directory)
    for f in ["engine.bin", "bench-data.h"]:
        (work / f).write_bytes((args.fixture / f).read_bytes())
    (work / "engine.S").write_text("\n".join(asm) + "\n")
    subprocess.run(["cc", "-O2", str(root / "cji/tools/rv32/emu.c"), "-lm", "-o", "emu"],
                   cwd=work, check=True)
    for position, depth, budget in chosen:
        idx, row = next((i,r) for i,r in enumerate(host["expected"])
                        if (r["name"],r["depth"],r["budget"]) == (position,depth,budget))
        (work / "profile.c").write_text(control.replace(loop, f"i = {idx}; i <= {idx}; ++i"))
        subprocess.run([args.gcc.resolve(), "-march=rv32im", "-mabi=ilp32", "-O2", "-nostdlib",
                        "-fno-builtin", "-msmall-data-limit=0", "-mno-relax", "-Wl,-Ttext=0x10000",
                        "-Wl,-e,_start", "profile.c", "engine.S", "-o", "profile.elf"], cwd=work,check=True)
        run = subprocess.run(["./emu", "profile.elf"], cwd=work, check=True, capture_output=True,
                             env={**os.environ,"RV32_PROFILE":"2"})
        values = struct.unpack("<5iQ", run.stdout)
        assert list(values[:5]) == [row["result"][field] for field in keys]
        counts = []
        for line in run.stderr.decode().splitlines():
            match = re.fullmatch(r"\s*(\d+) (chess\w+) \(entered (\d+) times\)", line)
            if match:
                count,name,calls = match.groups()
                counts.append({"name":name, "instructions":int(count), "calls":int(calls)})
        total = sum(fn["instructions"] for fn in counts)
        assert 0.99 * values[5] <= total <= values[5], (total,values)
        observations.append({"position":position,"depth":depth,"budget":budget,
                             "nodes":row["result"]["nodes"], "completed":row["result"]["completed"],
                             "originalIntervalInstructions":original["instructions"][idx],
                             "profileIntervalInstructions":values[5],"typedInstructions":total,"functions":counts})
args.output.write_text(json.dumps({"rv32SHA256":identity["digest"], "rows":observations},indent=2)+"\n")
