"""Compare every manifest world under the reference and experimental source compilers."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("candidate", type=Path)
args = parser.parse_args()
root = Path("picocalc-os/js")
control = next(Path("ttmp/2026/11/17").glob("*--cji-workspace*/sources/cji"))
failed = False
for world in json.loads((root / "system.json").read_text())["worlds"]:
    runs = []
    for compiler in (control, args.candidate):
        run = subprocess.run(["node", "--stack-size=4000", compiler / "cji.js",
                              root / world["file"], "--world-unit", "--emit"], capture_output=True)
        runs.append((run.returncode, run.stdout, run.stderr))
    a, b = runs
    equal = a == b
    failed |= not equal
    print(json.dumps(dict(world=world["name"], match=equal, exit_codes=[a[0], b[0]],
                          slir_sha256=[hashlib.sha256(run[1]).hexdigest() if run[0] == 0 else None for run in runs],
                          diagnostics=[run[2].decode(errors="replace")[:320] for run in runs])), flush=True)
raise SystemExit(int(failed))
