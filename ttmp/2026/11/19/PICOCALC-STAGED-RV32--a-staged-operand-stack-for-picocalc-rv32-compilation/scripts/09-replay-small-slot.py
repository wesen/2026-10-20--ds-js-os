#!/usr/bin/env python3
"""Execute ordinary Editor edit/save through the native loader at both real slot capacities."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile

REPO = Path(__file__).resolve().parents[6]


def run(*args, cwd=None, timeout=90):
    return subprocess.run(args, cwd=cwd, capture_output=True, check=True, timeout=timeout)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def compare(gcc, emulator, linked):
    driver_script, = REPO.glob("ttmp/2026/11/18/PICOCALC-TYPED-WORLDS--*/scripts/02-check-editor-world.mjs")
    with tempfile.TemporaryDirectory(prefix="picocalc-slot-replay-") as temp:
        work = Path(temp)
        run("env", f"TMPDIR={work}", "node", driver_script, gcc, emulator, "--edit", "--keep-fixture", cwd=REPO)
        fixture, = work.glob("typed-editor-reactor-*")
        driver = fixture / "driver.elf"
        observations = {}
        for size in ("standard", "small"):
            module = (linked / f"editor-{size}.elf").read_bytes()
            (work / "editor.so").write_bytes(module)
            result = run("env", "RV32_STEPS=1", emulator, driver, "editor.so", cwd=work)
            assert result.stdout.rstrip().endswith(b"Typed Editor startup, file read, missing file, and grant release passed")
            count = re.search(rb"rv32emu: (\d+) instructions", result.stderr)
            assert count, result.stderr
            observations[size] = {"moduleSha256": sha(module), "instructions": int(count[1]),
                                  "stdoutSha256": sha(result.stdout), "stdoutBytes": len(result.stdout)}
        assert observations["standard"]["stdoutSha256"] == observations["small"]["stdoutSha256"]
        return {"workload": "Editor edit and save", "driverSha256": sha(driver.read_bytes()), "results": observations}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("gcc", type=Path)
    parser.add_argument("emulator", type=Path)
    parser.add_argument("linked", type=Path)
    opts = parser.parse_args()
    result = compare(*(path.resolve(strict=True) for path in vars(opts).values()))
    print(json.dumps(result, indent=2))
