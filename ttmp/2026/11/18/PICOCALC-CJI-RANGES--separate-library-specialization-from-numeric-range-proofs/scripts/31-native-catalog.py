"""Check compiled stage 1 against the source reference with the device policy for arena size."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("compiler", type=Path)
args = parser.parse_args()
ticket = Path(__file__).resolve().parents[1]
reference = {r["world"]: r for r in map(json.loads, (ticket / "various/catalog.jsonl").read_text().splitlines())}
root = Path("picocalc-os/js")
failed = False
for world in json.loads((root / "system.json").read_text())["worlds"]:
    source = root / world["file"]
    size = source.stat().st_size
    mib = 10 if size > 32768 else 8
    cap = str(mib * 1024**2)
    start = time.monotonic()
    run = subprocess.run([args.compiler, "-g", "-C", "-h", cap, "-H", cap, "--", source, "--world-unit"],
                         capture_output=True, timeout=900)
    expected = reference[world["name"]]
    digest = hashlib.sha256(run.stdout).hexdigest() if run.returncode == 0 else None
    diagnostics = run.stderr.decode(errors="replace")
    # Both stage-0 and stage-1 reject unsupported inputs. Preserve stage-1 diagnostic for review.
    if expected["exit_codes"][0]:
        message = expected["diagnostics"][0].strip().splitlines()[-1]
        message = message.removeprefix("cji: ").removeprefix("error: ")
        match = run.returncode != 0 and bool(message) and message in diagnostics
    else:
        match = digest == expected["slir_sha256"][0]
    failed |= not match
    metrics = dict((key, int(value)) for key, value in re.findall(r"(frontend_us|gc_us|slide_bytes)=(\d+)", diagnostics))
    peak = re.search(r"most live (\d+) bytes", diagnostics)
    print(json.dumps(dict(world=world["name"], mib=mib, reference_match=match, status=run.returncode,
                          sha256=digest, elapsed_s=round(time.monotonic()-start, 3),
                          live_peak_bytes=int(peak[1]) if peak else None, metrics=metrics,
                          error=diagnostics[-900:] if run.returncode else None)), flush=True)
raise SystemExit(int(failed))
