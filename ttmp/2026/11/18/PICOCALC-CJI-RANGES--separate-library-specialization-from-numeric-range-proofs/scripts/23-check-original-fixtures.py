"""Compare compiler outputs against individual source fixtures from the original import archive."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
from zipfile import ZipFile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("archive", type=Path)
parser.add_argument("candidate", type=Path)
args = parser.parse_args()
control = Path("cji")
with ZipFile(args.archive) as archive, tempfile.TemporaryDirectory() as scratch:
    root = Path(scratch)
    for member in archive.namelist():
        path = Path(member)
        if path.parts[:3] == ("book", "cji", "tests") and len(path.parts) == 5 and path.suffix == ".js":
            dest = root / path.parts[3] / path.name
            dest.parent.mkdir(exist_ok=True)
            dest.write_bytes(archive.read(member))
    failed = False
    for file in sorted(root.glob("*/*.js")):
        if file.name.endswith(".world.js"):
            continue
        world_file = file.with_suffix(".world.js")
        inputs = [world_file, "--driver", file] if world_file.exists() else [file]
        runs = []
        for compiler in (control, args.candidate):
            run = subprocess.run(["node", "--stack-size=4000", compiler / "cji.js", *inputs, "--emit"],
                                 capture_output=True, timeout=300)
            runs.append((run.returncode, run.stdout, run.stderr))
        a, b = runs
        equal = a == b
        failed |= not equal
        print(json.dumps(dict(fixture=str(file.relative_to(root)), match=equal,
                              status=[a[0], b[0]], digests=[hashlib.sha256(r[1]).hexdigest() for r in runs],
                              diagnostics=[r[2].decode(errors="replace")[:300] for r in runs])), flush=True)
raise SystemExit(int(failed))
