"""Rotate native compilers and record time, heap metrics and output identity."""
import argparse
import hashlib
import json
from pathlib import Path
import re
from statistics import median
import subprocess


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--rounds", type=int, default=5)
parser.add_argument("--mib", type=int, default=8)
parser.add_argument("compilers", nargs="+", help="NAME=stage1 executable")
args = parser.parse_args()
compilers = {name: Path(executable) for name, executable in (item.split("=", 1) for item in args.compilers)}
names = list(compilers)
cap = str(args.mib * 1024 * 1024)


def digest(data):
    return hashlib.sha256(data).hexdigest()


receipt = {
    "arena_mib": args.mib,
    "compiler_sha256": {name: digest(path.read_bytes()) for name, path in compilers.items()},
    "worlds": {},
}
for world in ("agenda", "files"):
    source = Path("picocalc-os/js/apps") / f"{world}.js"
    rows = []
    outputs = {}
    for repeat in range(-1, args.rounds):
        offset = max(repeat, 0) % len(names)
        for name in names[offset:] + names[:offset]:
            command = [compilers[name], "-C", "-g", "-h", cap, "-H", cap, "--", source, "--world-unit"]
            run = subprocess.run(command, capture_output=True, check=True, timeout=300)
            diagnostic = run.stderr.decode()
            metrics = {key: int(value) for key, value in re.findall(r"(frontend_us|gc_us|slide_bytes)=(\d+)", diagnostic)}
            metrics["collections"] = int(re.search(r"cji: (\d+) collections", diagnostic)[1])
            metrics["live_peak_bytes"] = int(re.search(r"most live (\d+) bytes", diagnostic)[1])
            output = {"sha256": digest(run.stdout), "bytes": len(run.stdout)}
            if outputs.setdefault(name, output) != output:
                raise ValueError(f"non-deterministic output for {world} with {name}")
            rows.append(dict(warmup=repeat < 0, round=repeat, compiler=name, **metrics))
    fields = ("frontend_us", "gc_us", "collections", "live_peak_bytes")
    medians = {name: {key: median(r[key] for r in rows if not r["warmup"] and r["compiler"] == name)
                      for key in fields} for name in names}
    receipt["worlds"][world] = dict(source_sha256=digest(source.read_bytes()), outputs=outputs, medians=medians, rows=rows)
print(json.dumps(receipt, indent=2))
