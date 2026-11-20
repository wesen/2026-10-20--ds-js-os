"""Run after installing the current playable image. Hold the shared serial lock for this run."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("output", type=Path)
parser.add_argument("--port", default="/dev/ttyACM0")
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=False)
root = Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip())
capture = root / "picocalc-os/tools/p4cap.py"
commands = [(1,"worlds"), (5,"key f1"), (6,"key m"), (15,"shot"), *((25 + i * 0.27,"key down") for i in range(30)),
            (34,"shot"), (43,"key right"), (50,"shot"), (60,"key right"), (69,"shot"),
            (78,"key right"), (80,"key f1"), (81,"key m"), (86,"key f1"), (87,"key m"), (92,"key f1"),
            (93,"key m"), (122,"worlds"), (127,"key f1"), (128,"key h"), (134,"shot"), (145,"worlds")]
logs = args.output / "device.log"
with logs.open("wb") as out, (args.output / "capture.log").open("wb") as err:
    subprocess.run([sys.executable,str(capture),"-p",args.port,"--no-reset","--shot-dir",str(args.output),
                    "-s","152", *(v for t,cmd in commands for v in ("-c",f"{t} {cmd}"))],
                   stdout=out,stderr=err,check=True)
# Chess remains in focus at the end, so retry a damaged final capture in place.
for attempt in range(1, 4):
    if (args.output / "shot-5.png").exists():
        break
    directory = args.output / f"last-frame-retry-{attempt}"
    directory.mkdir()
    with (directory / "uart.log").open("wb") as out, (directory / "capture.log").open("wb") as err:
        subprocess.run([sys.executable, str(capture), "-p", args.port, "--no-reset", "-s", "12",
                        "-c", "1 shot", "--shot-dir", str(directory)], stdout=out, stderr=err, check=True)
    image = directory / "shot-1.png"
    if image.exists():
        image.rename(args.output / "shot-5.png")
data = logs.read_text(errors="replace")
for retry_log in args.output.glob("last-frame-retry-*/uart.log"):
    data += "\n" + retry_log.read_text(errors="replace")
snapshots = []
for line in data.splitlines():
    if not line.startswith('[{"name"'):
        continue
    try:
        rows = json.loads(line)
    except ValueError:
        continue
    snapshots.append({r["name"]:{k:r[k] for k in ("turns","state","last_error","restarts")}
                      for r in rows if r["name"] in ("compositor","sysmon","display","chess")})
faults = [s for s in data.splitlines() if '"ev":"fault"' in s]
shots = {p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(args.output.glob("shot-*.png"))}
receipt = dict(duration_s=152, commands=commands, snapshots=snapshots, faults=faults, screenshots=shots)
(args.output/"receipt.json").write_text(json.dumps(receipt,indent=2)+"\n")
if len(snapshots)<2 or len(shots)!=5 or any('"world":"compositor"' in s or '"world":"sysmon"' in s for s in faults):
    sys.exit("incomplete capture or a relevant device fault")
for name in ("sysmon","compositor","display"):
    first, last = snapshots[0][name],snapshots[-1][name]
    if last["restarts"] != first["restarts"] or last["last_error"] or last["turns"] <= first["turns"]:
        sys.exit(f"{name} did not stay healthy and advance")
