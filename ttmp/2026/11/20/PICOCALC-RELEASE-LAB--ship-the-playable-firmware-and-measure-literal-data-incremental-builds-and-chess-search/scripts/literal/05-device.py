"""Measure the literal compiler and writer under an approved board handoff, then restore release."""
import argparse
import fcntl
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import signal
import time

here = Path(__file__).resolve().parent
protocol = next(here.parents[2].glob("PICOCALC-CHESS-3D--*/scripts/scene/device.py"))
spec = importlib.util.spec_from_file_location("board_protocol", protocol)
board = importlib.util.module_from_spec(spec)
spec.loader.exec_module(board)
APP = "picocalc-os-p4.bin"
PART = "partition_table/partition-table.bin"
BASELINE = "134f3a249589a860a1a85311e361498a9e6ba4f14bef34ca2397ea26ca86ebc1"
COMPILE = re.compile(r"lit-(chess|editor)-(stock|half|word) compile source=bundle status=(\S+) us=(\d+) peak_js_bytes=(\d+) module_bytes=(\d+)")


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def bench(console):
    received = list(console.command("litbench", timeout=10))
    deadline = time.monotonic() + 220
    result = {"copyCycles": {}, "compileSamples": []}
    while time.monotonic() < deadline:
        text = received.pop(0) if received else console.line(deadline).decode(errors="replace")
        if text.startswith("LIT_BEGIN"):
            result["settings"] = text
        elif text.startswith("LIT_WRITE"):
            _, arm, *values = text.split()
            result["copyCycles"][arm] = list(map(int,values))
        elif match := COMPILE.search(text):
            world, arm, status, us, heap, size = match.groups()
            result["compileSamples"].append(
                {"world":world,"arm":arm,"status":status,"us":int(us),"peakJsBytes":int(heap),"linkedBytes":int(size)})
        elif text.startswith("LIT_DONE"):
            result["passed"] = (text == "LIT_DONE ok"
                and set(result["copyCycles"]) == {"stock","half","word"}
                and all(len(v)==11 for v in result["copyCycles"].values())
                and all(s["status"]=="ok" for s in result["compileSamples"])
                and len(result["compileSamples"])==30)
            return result
    raise TimeoutError("literal benchmark did not finish")


def run(args):
    result = {"candidate":sha(args.image / APP), "release":sha(args.release / APP),
              "partition":sha(args.release / PART)}
    if result["release"] != BASELINE or sha(args.image / PART) != result["partition"]:
        raise ValueError("candidate or restore image preflight failed")
    if args.preflight:
        print(json.dumps(result))
        return
    args.output.mkdir(parents=True,exist_ok=False)
    def save():
        (args.output / "receipt.json").write_text(json.dumps(result,indent=2)+"\n")

    with board.serial.LOCK.open("a") as lock, (args.output / "uart.log").open("wb",buffering=0) as log:
        fcntl.flock(lock,fcntl.LOCK_EX)
        def connect():
            return board.serial.Console(args.port,log)

        ready = connect()
        board.hold(ready)
        board.esp(args,"verify_flash",args.release,"release-before")
        ready = connect()
        board.hold(ready)
        try:
            board.esp(args,"write_flash",args.image,"literal-write")
            board.esp(args,"verify_flash",args.image,"literal-verify")
            ready = connect()
            ready.health()
            result.update(bench(ready))
            save()
            if not result["passed"]:
                raise ValueError("literal board evidence failed")
        finally:
            try:
                if ready.port.is_open:
                    board.hold(ready)
            except Exception as error:
                result["candidateHoldError"] = str(error)
            ready.close()
            board.esp(args,"write_flash",args.release,"release-restore")
            board.esp(args,"verify_flash",args.release,"release-restore-verify")
            result["restoreReadback"] = True
            save()
            ready = connect()
            try:
                result["restoredWorlds"] = sorted(w for w in ready.health() if w in board.serial.NATIVE)
                result["restoredPainter"] = board.painter(ready)
            finally:
                ready.close()
                save()


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    for name in ("image","release","output"):
        cli.add_argument(name,type=Path)
    cli.add_argument("--port",default="/dev/ttyACM0")
    cli.add_argument("--esptool",type=Path,default=Path("/home/manuel/.espressif/python_env/idf5.4_py3.11_env/bin/esptool.py"))
    cli.add_argument("--preflight",action="store_true")
    def interrupted(_signal,_frame):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM,interrupted)
    run(cli.parse_args())
