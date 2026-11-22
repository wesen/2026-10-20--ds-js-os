"""09-run-board.py: run the Candela benchmark app once, then restore and verify the playable firmware.

usage (repository root): python3 09-run-board.py --app BUILD/candela-bench.bin --out NEW_DIR [--deadline 900]
       python3 09-run-board.py --probe --out NEW_DIR      (health of the running firmware only)

Derived from PICOCALC-SIMD-LAB scripts/ray/02-run-board.py. The restore target is read from
/tmp/picocalc-current-playable.txt ("<build dir> <app sha256>") once the lock is held, because other sessions
install new playable builds; board_common.check_build verifies that app and the expected partition table.
Under the shared serial lock (board_common.acquire, held for this one run only):
  1. health check of the running firmware (eight worlds, painter, keyboard I2C); a failure stops the run
     before anything is flashed;
  2. verify_flash of the playable image, so the board is known to hold it;
  3. write and verify the benchmark app at 0x10000 only;
  4. collect UART lines between CANDELA BEGIN and CANDELA END into bench.log (a trap after the CKPROBE
     line is the minstret probe's answer, not a failure);
  5. finally: write and verify the playable app, and record its health in after.json.
A keyboard I2C failure in either health check needs a power cycle by the user: it is reported in
keyboard-failure.txt and the script exits with status 3.
"""
import argparse
import hashlib
from pathlib import Path
import subprocess
import sys
import time

from serial import Serial

ticket = Path(__file__).resolve().parents[1]
repo = next(p for p in ticket.parents if (p / ".git").exists())
previous = next((repo / "ttmp/2026/11/20").glob("PICOCALC-RAYTRACE--*"))
sys.path.insert(0, str(previous / "scripts/device"))
from board_common import acquire, check_build, health, release, save  # noqa: E402

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--port", default="/dev/ttyACM0")
parser.add_argument("--app", type=Path)
parser.add_argument("--probe", action="store_true", help="only check the running firmware's health; flash nothing")
parser.add_argument("--out", type=Path, required=True)
parser.add_argument("--deadline", type=float, default=900)
args = parser.parse_args()
if not args.probe and not (args.app and args.app.is_file()):
    raise SystemExit("A built benchmark app is required")
args.out.mkdir(parents=True, exist_ok=False)


def keyboard_failure(where, exc):
    (args.out / "keyboard-failure.txt").write_text(f"{where}: {exc}\nThe keyboard I2C bus needs a power cycle by the user. No further device work.\n")
    print(f"KEYBOARD FAILURE ({where}): {exc}", file=sys.stderr)
    sys.exit(3)


with acquire(), (args.out / "uart.log").open("wb", buffering=0) as log:
    # read the restore target only once the lock is held: another session may install a new playable build
    # while this run waits for the lock
    pointer = Path("/tmp/picocalc-current-playable.txt").read_text().split()
    restore, restore_sha = Path(pointer[0]), pointer[1]
    check_build(restore, restore_sha)
    save(args.out / "restore.json", {"build": str(restore), "sha256": restore_sha})
    console = release.unit.Console(args.port, log)
    try:
        save(args.out / "before.json", health(console))
    except ValueError as exc:
        console.close()
        keyboard_failure("before the run", exc)
    finally:
        console.close()
    if args.probe:
        print((args.out / "before.json").read_text())
        sys.exit(0)
    console = release.unit.Console(args.port, log)
    release.hold(console)
    release.esp("verify_flash", restore, args.out, "verified-prior", args.port)
    console = release.unit.Console(args.port, log)
    health(console)
    release.hold(console)
    outcome = {"sha256": hashlib.sha256(args.app.read_bytes()).hexdigest(), "bytes": args.app.stat().st_size, "port": args.port}
    try:
        with (args.out / "trial-write.log").open("wb") as f:
            subprocess.run([release.ESP, "--chip", "esp32p4", "-p", args.port, "-b", "921600", "--after", "no_reset",
                            "write_flash", "0x10000", str(args.app)], check=True, stdout=f, stderr=subprocess.STDOUT, timeout=180)
        with (args.out / "trial-verify.log").open("wb") as f:
            subprocess.run([release.ESP, "--chip", "esp32p4", "-p", args.port, "-b", "921600", "--after", "hard_reset",
                            "verify_flash", "0x10000", str(args.app)], check=True, stdout=f, stderr=subprocess.STDOUT, timeout=180)
        deadline = time.monotonic() + args.deadline
        began = probing = False
        t0 = time.monotonic()
        with Serial(args.port, 115200, timeout=.3) as stream, (args.out / "bench.log").open("wb", buffering=0) as out:
            while time.monotonic() < deadline:
                line = stream.readline()
                if not line:
                    continue
                out.write(line)
                if b"CANDELA BEGIN" in line:
                    began = True
                elif b"CANDELA END" in line and began:
                    outcome["end"] = "CANDELA END"
                    break
                elif b"CKPROBE minstret" in line:
                    probing = True
                elif b"Guru Meditation" in line or b"assert failed" in line:
                    if probing:
                        outcome["end"] = "trap during the minstret probe"
                        outcome["trap"] = line.decode(errors="replace").strip()
                        break
                    raise RuntimeError(line.decode(errors="replace").strip())
            else:
                raise TimeoutError("no CANDELA END; inspect bench.log")
        outcome["seconds"] = round(time.monotonic() - t0, 1)
        save(args.out / "image.json", outcome)
    finally:
        release.esp("write_flash", restore, args.out, "restore-write", args.port)
        release.esp("verify_flash", restore, args.out, "restore-verify", args.port)
        console = release.unit.Console(args.port, log)
        try:
            save(args.out / "after.json", {"sha256": restore_sha, "build": str(restore), "health": health(console)})
        except ValueError as exc:
            console.close()
            keyboard_failure("after restoring the playable firmware", exc)
        finally:
            console.close()
print((args.out / "after.json").read_text())
