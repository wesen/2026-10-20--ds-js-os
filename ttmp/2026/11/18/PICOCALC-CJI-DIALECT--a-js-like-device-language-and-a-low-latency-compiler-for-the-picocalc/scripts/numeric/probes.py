"""Compare source and compiled CJI on observable numeric boundaries."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("scratch", type=Path)
parser.add_argument("compilers", nargs="+", help="NAME=path to cji.js or stage1")
args = parser.parse_args()
args.scratch.mkdir(parents=True, exist_ok=True)
cji = next(Path("ttmp/2026/11/17").glob("*--cji-workspace*/sources/cji"))
fixtures = sorted(Path(__file__).with_name("fixtures").glob("*.js"))


def check(cmd):
    run = subprocess.run(cmd, capture_output=True, timeout=120)
    return run.returncode, run.stdout, run.stderr.decode(errors="replace")


def process(name, command, flags, fixture):
    status, ir, diagnostic = check([*command, fixture, *flags])
    identity = hashlib.sha256(ir).hexdigest() if status == 0 else None
    if status == 0:
        path = args.scratch / f"{name}-{fixture.stem}.slir"
        path.write_bytes(ir)
        try:
            status, out, diagnostic = check([cji / "slas", path])
            result = {"status": status, "stdout": out.decode(), "stderr": diagnostic.strip()}
        except subprocess.TimeoutExpired:
            result = {"status": "timeout"}
    else:
        result = None
    return {"compile_status": 0 if identity else status, "slir_sha256": identity,
            "compile_diagnostic": diagnostic.strip() if not identity else None, "run": result}


for fixture in fixtures:
    row = {"fixture": fixture.stem}
    for entry in args.compilers:
        name, path = entry.split("=", 1)
        if name == "node":
            status, out, diagnostic = check(["node", fixture])
            row[name] = {"status": status, "stdout": out.decode(), "stderr": diagnostic.strip()}
        elif path.endswith(".js"):
            row[name] = process(name, ["node", path], ["--emit"], fixture)
        else:
            row[name] = process(name, [path, "-C", "-h", "8388608", "-H", "8388608", "--"], [], fixture)
    print(json.dumps(row), flush=True)
