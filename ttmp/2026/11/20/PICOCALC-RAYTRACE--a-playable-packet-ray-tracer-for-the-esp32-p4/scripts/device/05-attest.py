"""Attest the linked ordinary ray-tracing release against the committed kernel and UI."""

import argparse
import hashlib
import json
import subprocess
from pathlib import Path


def sha(data):
    return hashlib.sha256(data).hexdigest()


p = argparse.ArgumentParser(description=__doc__)
p.add_argument("stage", type=Path)
p.add_argument("output", type=Path)
args = p.parse_args()
repo = next(
    path for path in Path(__file__).resolve().parents if (path / ".git").exists()
)
stage = args.stage.resolve()
build = stage / "build"
revision = (stage / "revision").read_text().strip()
names = [
    "cji/src/world-native.js",
    "picocalc-os/js/apps/raytrace.js",
    "picocalc-os/js/system.json",
    "picocalc-os/js/system/compositor.js",
    "picocalc-os/nucleus/gfx.c",
    "picocalc-os/nucleus/native.c",
    "picocalc-os/nucleus/raytrace_demo.c",
    "picocalc-os/nucleus/raytrace_demo.h",
    "picocalc-os/nucleus/raytrace_demo_pie.S",
    "picocalc-os/port/esp32p4/main/raybench_p4.c",
]
sources = {}
for name in names:
    data = (stage / "tree" / name).read_bytes()
    assert data == subprocess.check_output(
        ["git", "show", revision + ":" + name], cwd=repo
    )
    sources[name] = sha(data)
pd = json.loads((build / "project_description.json").read_bytes())
cc = pd["c_compiler"]
objdump = cc.removesuffix("gcc") + "objdump"
elf = build / "picocalc-os-p4.elf"
disasm = subprocess.check_output(
    [objdump, "-d", "--disassemble=raytrace_demo_pie_row", str(elf)], text=True
)
assembly = [line.strip() for line in disasm.splitlines() if "\t" in line]
for op in ("esp.vldbc.16.ip", "esp.vld.128.ip", "esp.vsub.s16", "esp.vst.128.ip"):
    assert any(op in x for x in assembly), op
binary = (build / "picocalc-os-p4.bin").read_bytes()
part = (build / "partition_table/partition-table.bin").read_bytes()
cmake = (build / "CMakeCache.txt").read_text().splitlines()
opts = {
    k: next(x.split("=", 1)[1] for x in cmake if x.startswith(k + ":"))
    for k in [
        "PICOCALC_HEADLESS",
        "PICOCALC_CHESS_3D",
        "PICOCALC_RV32_CHESS",
        "PICOCALC_RV32_EDITOR",
        "PICOCALC_RV32_FILES",
        "PICOCALC_RV32_AGENDA",
        "PICOCALC_MOBILE_PAINTER",
    ]
}
assert opts["PICOCALC_HEADLESS"] == "OFF" and all(
    v == "ON" for k, v in opts.items() if k != "PICOCALC_HEADLESS"
)
assert b"RAYROW " in binary and b"key" in binary
assert sha(part) == "72721dc3ce2597504dc568023e778100401a308455fea40d174d282386571d30"
assert len(binary) <= 8388608
data = {
    "revision": revision,
    "appSHA256": sha(binary),
    "appBytes": len(binary),
    "partitionSHA256": sha(part),
    "elfSHA256": sha(elf.read_bytes()),
    "normalProfile": opts,
    "sourceDigests": sources,
    "pieDisassembly": assembly,
}
args.output.write_text(json.dumps(data, indent=2) + "\n")
print(data["appSHA256"])
