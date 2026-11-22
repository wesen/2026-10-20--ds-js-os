"""Flash an arms measurement image, capture cold boots, and restore the playable app.

usage (repo root):
    python3 02-run-arms-firmware.py --image BUILD --restore PLAYABLE_BUILD --restore-sha SHA256 --out DIR \
        [--boots 2] [--seconds 300]

BUILD and PLAYABLE_BUILD are ESP-IDF build directories (picocalc-os-p4.bin and
partition_table/partition-table.bin); both must pass board_common.check_build. Only the app
slot at 0x10000 is written. Each boot is a reset followed by a fixed-length UART capture
(tools/p4cap.py) that sends `worlds` near its end. Writes boot-N.log, rows.jsonl (every
CCARM row, with its boot index) and worlds-N.json (the world list at the end of boot N). The
finally clause writes and verifies the playable app and records its health in after.json.
"""
import argparse, hashlib, json, subprocess, sys
from pathlib import Path

ticket = Path(__file__).resolve().parents[1]
repo = next(p for p in ticket.parents if (p / ".git").exists())
device = next((repo / "ttmp/2026/11/20").glob("PICOCALC-RAYTRACE--*")) / "scripts/device"
sys.path.insert(0, str(device))
from board_common import acquire, check_build, health, release, save

p = argparse.ArgumentParser(description=__doc__)
p.add_argument("--port", default="/dev/ttyACM0")
p.add_argument("--image", type=Path, required=True)
p.add_argument("--restore", type=Path, required=True)
p.add_argument("--restore-sha", required=True)
p.add_argument("--out", type=Path, required=True)
p.add_argument("--boots", type=int, default=2)
p.add_argument("--seconds", type=float, default=300)
a = p.parse_args()
image_sha = hashlib.sha256((a.image / release.APP).read_bytes()).hexdigest()
check_build(a.image, image_sha)
check_build(a.restore, a.restore_sha)
a.out.mkdir(parents=True, exist_ok=False)
capture = [sys.executable, str(repo / "picocalc-os/tools/p4cap.py"), "-p", a.port]
with acquire():
    try:
        release.esp("write_flash", a.image, a.out, "trial-write", a.port)
        release.esp("verify_flash", a.image, a.out, "trial-verify", a.port)
        with (a.out / "rows.jsonl").open("w") as rows:
            for boot in range(a.boots):
                log = subprocess.run([*capture, "-s", str(a.seconds), "-c", f"{a.seconds - 10:.1f} worlds"],
                                     capture_output=True, text=True, errors="replace", timeout=a.seconds + 60).stdout
                (a.out / f"boot-{boot}.log").write_text(log)
                for line in log.splitlines():
                    if line.startswith("CCARM {"):
                        row = json.loads(line[6:])
                        row["boot"] = boot
                        rows.write(json.dumps(row) + "\n")
                worlds = next((json.loads(l) for l in reversed(log.splitlines()) if l.startswith('[{"name":')), None)
                save(a.out / f"worlds-{boot}.json", worlds)
                print(f"boot {boot}: {sum(l.startswith('CCARM {') for l in log.splitlines())} rows, "
                      f"worlds {'ok' if worlds else 'missing'}", flush=True)
    finally:
        release.esp("write_flash", a.restore, a.out, "restore-write", a.port)
        release.esp("verify_flash", a.restore, a.out, "restore-verify", a.port)
        with (a.out / "uart.log").open("wb", buffering=0) as log:
            console = release.unit.Console(a.port, log)
            try:
                save(a.out / "after.json", {"sha256": a.restore_sha, "imageSha256": image_sha, "health": health(console)})
            finally:
                console.close()
print((a.out / "after.json").read_text())
