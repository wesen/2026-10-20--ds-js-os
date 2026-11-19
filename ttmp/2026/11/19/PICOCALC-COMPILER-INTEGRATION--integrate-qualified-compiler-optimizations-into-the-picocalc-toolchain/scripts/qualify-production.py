"""Qualify buffered and streamed production firmware images on a PicoCalc, then restore the saved app partition."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import runpy
import statistics
import subprocess
import sys

ticket = Path(__file__).resolve().parents[1]
old = ticket.parent.parent / "18"
harness, = old.glob("PICOCALC-TYPED-APPS--*/scripts/06-qualify-files-on-p4.py")
board = runpy.run_path(str(harness))
parser = argparse.ArgumentParser(description=__doc__)
for name in ("buffered", "streamed", "output", "backup", "esptool-python", "esptool"):
    parser.add_argument("--" + name, type=Path, required=True)
parser.add_argument("--port", required=True)
parser.add_argument("--revision", required=True)
args = parser.parse_args()

def sha(data):
    return hashlib.sha256(data).hexdigest()

original = args.backup / "factory-original.bin"
onboard_table = (args.backup / "partition-table.bin").read_bytes()
assert original.stat().st_size == 8 * 1024**2 and len(onboard_table) == 4096
sources = {}
for path in ("compiler/typed-wasm.js", "compiler/typed-rv32.js", "compiler/typed-world.js",
             "worlds/files/compile.js", "worlds/agenda/compile.js"):
    sources[path] = subprocess.check_output(["git", "show", f"{args.revision}:picocalc-os/{path}"])
receipts = {}
for mode in ("buffered", "streamed"):
    directory = getattr(args, mode)
    image = (directory / "picocalc-os-p4.bin").read_bytes()
    assert 0 < len(image) < original.stat().st_size
    assert (directory / "partition-table.bin").read_bytes().ljust(4096, b"\xff") == onboard_table
    for path, data in sources.items():
        assert data in image, f"{mode}: firmware does not embed {path} from {args.revision}"
    receipts[mode] = {"firmware_sha256": sha(image), "boots": []}

worlds = ("files", "agenda", "editor")
def check_worlds(log):
    entries = next(json.loads(line) for line in log.splitlines() if line.startswith('[{"name":'))
    for name in worlds:
        entry = next(e for e in entries if e["name"] == name)
        assert entry["engine"] == "native" and entry["file"] == f"{name}/compiled.bin" and not entry["last_error"], entry

args.output.mkdir()
result = {"revision": args.revision, "compiler_sha256": {p: sha(v) for p, v in sources.items()},
          "original_partition_sha256": sha(original.read_bytes()), "modes": receipts}
def save():
    (args.output / "results.json").write_text(json.dumps(result, indent=2) + "\n")

def qualify(mode):
    output = args.output / mode
    output.mkdir()
    receipt = receipts[mode]
    board["flash"](args, output, getattr(args, mode) / "picocalc-os-p4.bin", "production")
    for n in range(4):
        # First boot starts at the flasher's reset. Subsequent reboots clear VM state and caches.
        commands = ["11 worlds"] if n == 0 else ["0.3 reboot", "11 worlds"]
        boot = board["capture"](args.port, output, f"boot-{n+1}", 13, commands)
        check_worlds(boot)
        samples = {}
        for name in worlds:
            streamed = f"{name} native compiler functions=streamed" in boot.splitlines()
            assert streamed == (mode == "streamed"), f"boot {n+1}: unexpected function mode for {name}"
            matches = re.findall(rf"^{name} compile source=bundle status=ok us=(\d+) peak_js_bytes=(\d+) module_bytes=(\d+)$", boot, re.M)
            if len(matches) != 1:
                raise RuntimeError(f"boot {n+1}: expected one successful {name} compile, found {len(matches)}")
            samples[name] = dict(zip(("us", "peak_js_bytes", "module_bytes"), map(int, matches[0])))
        receipt["boots"].append(samples)
        save()
    receipt["medians"] = {name: {key: statistics.median(row[name][key] for row in receipt["boots"])
                                 for key in receipt["boots"][0][name]} for name in worlds}
    if mode == "streamed":
        checker, = ticket.parent.glob("PICOCALC-EDITOR-CAPACITY--*/scripts/03-check-large-preview-on-p4.py")
        subprocess.run([sys.executable, checker, "--engine", "native", "--port", args.port,
                        "--output", output / "preview", "--long-inline"], check=True)
        compare, = ticket.parent.glob("PICOCALC-COMPILER-THESIS--*/scripts/supervisor/p4-verify-preview.py")
        receipt["pixel_comparison"] = json.loads(subprocess.check_output([sys.executable, compare, output / "preview"]))
        receipt["workflow"] = json.loads((output / "preview/results.json").read_text())
try:
    for mode in ("buffered", "streamed"):
        qualify(mode)
        save()
finally:
    board["flash"](args, args.output, original, "restore")
    check_worlds(board["capture"](args.port, args.output, "restored", 14, ["11 worlds"]))
    result["original_restored"] = True
    save()
print(json.dumps({mode: r["medians"] for mode, r in receipts.items()}))
