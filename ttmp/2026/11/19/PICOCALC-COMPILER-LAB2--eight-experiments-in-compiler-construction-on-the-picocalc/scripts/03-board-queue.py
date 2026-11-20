"""Serialize already-qualified trials on one P4 and require restoration before the next trial."""
import argparse
import fcntl
import hashlib
import json
from pathlib import Path
import subprocess
import time

HERE = Path(__file__).resolve().parent
PREVIOUS, = HERE.parent.parent.glob("PICOCALC-COMPILER-LAB--*/scripts")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("backup", type=Path)
    parser.add_argument("esptool", type=Path)
    parser.add_argument("port")
    parser.add_argument("works", type=Path, nargs="+")
    args = parser.parse_args()
    original = args.backup / "factory-original.bin"
    if not original.exists() or original.stat().st_size != 8 * 1024 * 1024:
        raise ValueError("missing complete factory partition")
    print("Restoration SHA-256", hashlib.sha256(original.read_bytes()).hexdigest(), flush=True)
    with (args.backup / "serial.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        for path in args.works:
            receipt = path / "physical.json"
            if receipt.exists():
                raise FileExistsError(receipt)
            print(time.ctime(), "start", path, flush=True)
            with (path / "board-run.log").open("w") as log:
                subprocess.run(["python3", "-B", PREVIOUS / "04-board.py", path, args.backup,
                                "--port", args.port, "--esptool", args.esptool, "--boots", "2"],
                               stdout=log, stderr=subprocess.STDOUT, check=True)
            result=json.loads(receipt.read_text())
            if not result["restored"] or len(result["boots"]) != 2:
                raise ValueError("missing successful restoration or boots")
            with (path / "summary.json").open("w") as summary:
                subprocess.run(["python3", "-B", PREVIOUS / "05-summarize.py", receipt],
                               stdout=summary, check=True)
            print(time.ctime(), "qualified and restored", path, flush=True)


if __name__ == "__main__":
    main()
