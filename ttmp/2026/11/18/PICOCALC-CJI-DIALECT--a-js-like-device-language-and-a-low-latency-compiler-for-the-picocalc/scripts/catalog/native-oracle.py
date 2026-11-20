"""Run exact function slices in Node and in the CJI assembler/runtime.

Use --compiler for a separately materialized compiler source such as local numeric lowering.
The Files fixture supplies a local filesystem stand-in, independently of the real kernel oracle.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

SCRIPTS = Path(__file__).resolve().parent
REPO = next(p for p in SCRIPTS.parents if (p / "picocalc-os/Makefile").exists())
OS = REPO / "picocalc-os"
CJI = REPO / "cji"
FILES = {
    "agenda": ("// ---- dates", {
        "parsed": {"line": "- [ ] dentist @2026-11-03 14:30 !15m", "done": False, "title": "dentist",
                   "date": "2026-11-03", "time": "14:30", "lead": 15, "leadText": "!15m"},
        "invalidDate": None, "invalidDone": True,
    }),
    "files": ("async function fiOpen", {
        "sizes": ["723 B", "1.0 KB", "1.5 KB", "1.0 GB"], "selected": "z.txt",
        "first": "a", "more": True, "free": 42,
    }),
}


def check(command):
    result = subprocess.run(command, capture_output=True, text=True, cwd=OS, timeout=50)
    if result.returncode:
        raise AssertionError(str(command) + "\n" + result.stderr + result.stdout)
    return result.stdout


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--compiler", type=Path, default=CJI / "cji.js")
    parser.add_argument("--rv32", action="store_true")
    args = parser.parse_args()
    compiler = args.compiler.resolve()
    with tempfile.TemporaryDirectory(prefix="picocalc-catalog-native-") as tmp:
        for name, (end, want) in FILES.items():
            source = (OS / "js/apps" / (name + ".js")).read_text().split(end, 1)[0]
            fixture = (SCRIPTS / f"native-{name}-driver.js").read_text()
            input_file = Path(tmp, name + ".js")
            input_file.write_text(source + "\n" + fixture)
            baseline = json.loads(check(["node", input_file]))
            assert baseline == want, baseline
            ir = check(["node", compiler, input_file, "--emit"])
            candidate = Path(tmp, name + ".slir")
            candidate.write_text(ir)
            actual = json.loads(check([CJI / "slas", candidate]))
            assert actual == baseline, (actual, baseline)
            print(f"{name} x86-64 machine code slir_sha256={hashlib.sha256(ir.encode()).hexdigest()} {json.dumps(actual)}", flush=True)
            if args.rv32:
                obj = candidate.with_suffix(".o")
                check([CJI / "slas-rv32", "-c", obj, candidate])
                tools = CJI / "build/rv32"
                output = check([tools / "rv32emu", tools / "fw-test.elf", obj])
                # rv32emu reports its instruction totals on stderr.
                emulated = json.loads(output)
                assert emulated == baseline, (emulated, baseline)
                print(f"{name} RV32 emulation object_sha256={hashlib.sha256(obj.read_bytes()).hexdigest()} {json.dumps(emulated)}", flush=True)
