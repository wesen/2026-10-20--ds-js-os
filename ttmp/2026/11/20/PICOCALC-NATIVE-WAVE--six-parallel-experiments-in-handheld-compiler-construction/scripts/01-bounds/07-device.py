"""Measure native admission and operation lifetime under an approved board handoff, then restore release."""
import argparse
from collections import Counter
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
COMPILE = re.compile(r"wave-(chess|editor)-(stock|bounds-always|bounds-order|bounds-selected|semantics-late|semantics-selected) compile source=bundle status=(\S+) us=(\d+) peak_js_bytes=(\d+) module_bytes=(\d+)")


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def observations(result, text):
    if text.startswith("WAVE_BEGIN"):
        result["settings"] = text
    elif text.startswith("WAVE_NATIVE "):
        _, endpoint, arm, *values = text.split()
        result["nativeBatchCycles"].setdefault(endpoint, {})[arm] = list(map(int,values))
    elif text.startswith("WAVE_NATIVE_CHECK "):
        result["nativeChecked"] = text == "WAVE_NATIVE_CHECK ok"
    elif match := COMPILE.search(text):
        world, arm, status, us, heap, size = match.groups()
        result["compileSamples"].append(
            {"world":world,"arm":arm,"status":status,"us":int(us),"peakJsBytes":int(heap),"linkedBytes":int(size)})
    elif text.startswith("WAVE_DONE"):
        result["completed"] = text == "WAVE_DONE ok"
        return True
    return False


def bench(console, result, short):
    received = list(console.command("wave12short" if short else "wave12", timeout=10))
    deadline = time.monotonic() + 480
    result.update({"nativeBatchCycles": {}, "compileSamples": []})
    while time.monotonic() < deadline:
        text = received.pop(0) if received else console.line(deadline).decode(errors="replace")
        if observations(result,text):
            runs = result["nativeBatchCycles"]
            expected = {"stock","bounds-order","bounds-selected","semantics-late","semantics-selected"}
            observed = Counter((s["world"],s["arm"]) for s in result["compileSamples"])
            result["passed"] = (result["completed"] and result["nativeChecked"]
                and set(runs) == {"repeated","literal","write"}
                and all(set(arms) == expected and all(len(v)==11 for v in arms.values()) for arms in runs.values())
                and all(s["status"]=="ok" for s in result["compileSamples"])
                and set(observed) == {(app,arm) for app in ["chess","editor"] for arm in expected|{"bounds-always"}}
                and all(v==(1 if short else 5) for v in observed.values()))
            return
    raise TimeoutError("native wave benchmark did not finish")


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
            board.esp(args,"write_flash",args.image,"wave-write")
            board.esp(args,"verify_flash",args.image,"wave-verify")
            ready = connect()
            ready.health()
            bench(ready, result, args.short)
            save()
            if not result["passed"]:
                raise ValueError("wave board evidence failed")
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
                deadline = time.monotonic() + 18
                result["restoredPainter"] = board.painter(ready)
                while not result["restoredPainter"]["installed"] and time.monotonic() < deadline:
                    time.sleep(.15)
                    result["restoredPainter"] = board.painter(ready)
                if not result["restoredPainter"]["installed"] or result["restoredPainter"]["rejects"]:
                    raise RuntimeError("restored ordinary painter did not install")
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
    cli.add_argument("--short",action="store_true")
    def interrupted(_signal,_frame):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM,interrupted)
    run(cli.parse_args())
