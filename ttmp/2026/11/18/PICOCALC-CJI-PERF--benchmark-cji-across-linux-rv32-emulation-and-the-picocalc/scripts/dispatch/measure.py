"""Exercise the same world handlers in Linux QuickJS, Linux AOT and the RV32 shared-unit harness."""
import argparse
import csv
import hashlib
import json
import os
from pathlib import Path
import re
import statistics
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("out", type=Path)
args = parser.parse_args()
out = args.out.resolve()
fixture = Path(__file__).with_name("bench.world.js")
agenda = Path("picocalc-os/js/apps/agenda.js").read_text()
for pattern in [r"const AG_LINE = .*?;", r"function agToggled\(line\) \{.*?\n\}"]:
    assert re.search(pattern, agenda, re.S)[0] == re.search(pattern, fixture.read_text(), re.S)[0]
cji = Path("cji")
rv32 = cji / "build/rv32"


def expected(case, value):
    if case == "mix":
        x = value
        for _ in range(1024):
            x ^= (x << 13) & 0xffffffff
            x ^= x >> 17
            x ^= (x << 5) & 0xffffffff
        return x & 0x7fffffff
    if case == "array":
        return sum((i * 31 + 17) % 256 for i in range(value)) * 8
    # Eight toggles per task leave initially marked boxes as supplied and give the plain item a box.
    checksum = 0
    for line in ["- [ ] alpha", "- [x] beta", "  - [ ] gamma"]:
        for ch in line:
            checksum = (checksum * 31 + ord(ch)) & 0x7fffffff
    return checksum


def distribution(values):
    assert len(values) == 24
    return dict(n=24, median=statistics.median(values), min=min(values), max=max(values))


results = []
for case, value, ops in [("mix",17,1024), ("array",16,128), ("array",128,1024),
                         ("array",512,4096), ("edit",17,24)]:
    checksum = expected(case, value)
    stem = f"{case}-{value}"
    command = [out/"host", "picocalc-os/js/prelude.js", fixture, case, str(value)]
    raw = subprocess.check_output(command, env=dict(os.environ, NW_SELF="bench"), text=True)
    (out/f"{stem}.csv").write_text(raw)
    rows = list(csv.reader(raw.splitlines()))
    assert len(rows) == 50 and all(int(r[3]) == checksum for r in rows), stem
    entry = dict(case=case, input=value, operations=ops, checksum=checksum)
    for engine in ["quickjs", "cji-aot"]:
        samples = [r for r in rows if r[1] == engine]
        assert [int(r[0]) for r in samples] == list(range(25))
        entry[engine] = dict(unit="ns_per_message", **distribution([int(r[2]) for r in samples[1:]]))
    events = ["msg",case,str(value),"ask","state","null"] * 25
    run = subprocess.run([rv32/"rv32emu", rv32/"fw-nw-units.elf", out/"bench.so", "--",
                          "NW_SELF=bench", "NW_STEPS=1", *events], capture_output=True, text=True, check=True)
    (out/f"{stem}.rv32.log").write_text(run.stdout + run.stderr)
    assert re.findall(r"^reply (.+)$", run.stdout, re.M) == [str(checksum)] * 25
    counts = [int(n) for n in re.findall(r"^fw: steps bench msg (\d+)$",run.stderr,re.M)]
    assert len(counts) == 25
    entry["cji-rv32"] = dict(unit="guest_steps_per_message", **distribution(counts[1:]))
    results.append(entry)
files = [fixture, Path("picocalc-os/js/prelude.js"), out/"host", out/"bench.so", rv32/"fw-nw-units.elf"]
report = dict(suite="world-dispatch", identities={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in files},
              results=results)
print(json.dumps(report,indent=2))
