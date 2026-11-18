"""Request individual trials over UART, starting at a complete manifest cycle."""
import argparse
import hashlib
import json
from pathlib import Path
import time

import serial


def read_trial(port, log):
    port.write(b"\nbench\n")
    deadline = time.monotonic() + 40
    while time.monotonic() < deadline:
        line = port.readline().decode(errors="replace").strip()
        if not line:
            continue
        print(line, file=log, flush=True)
        if any(token in line for token in ("Guru Meditation", "assert failed:", "Rebooting...")):
            raise RuntimeError(line)
        if line.startswith("DIALECT_QJS "):
            fields = dict(word.split("=", 1) for word in line.split()[1:])
            return {k: v if k in ("world", "source", "bytecode") else int(v) for k, v in fields.items()}
    raise TimeoutError("no bench completion")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("out", type=Path)
    parser.add_argument("--trials", type=int, default=3)
    parser.add_argument("--port", default="/dev/serial/by-id/usb-1a86_USB_Single_Serial_5B61091051-if00")
    args = parser.parse_args()
    root = Path("picocalc-os/js")
    worlds = json.loads((root / "system.json").read_text())["worlds"]
    with serial.Serial(args.port, 115200, timeout=0.25) as port, (args.out / "qjs-uart.log").open("x") as log, (args.out / "qjs.jsonl").open("x") as rows:
        port.reset_input_buffer()
        # The ordinary boot calibration also calls the diagnostic callback.
        for _ in worlds:
            row = read_trial(port, log)
            if row["world"] == worlds[0]["name"]:
                break
        else:
            raise RuntimeError("first manifest entry never observed")
        first_trial = row["trial"]
        for trial in range(first_trial, first_trial + args.trials):
            for index, world in enumerate(worlds):
                if trial != first_trial or index:
                    row = read_trial(port, log)
                if (row["world"], row["trial"]) != (world["name"], trial):
                    raise ValueError(row)
                source = (root / world["file"]).read_bytes()
                if row["size"] != len(source) or row["source"] != hashlib.sha256(source).hexdigest():
                    raise ValueError("source mismatch for " + world["name"])
                print(json.dumps(row), file=rows, flush=True)
                print(world["name"], trial, row["ok"], row["compile_us"], row["ready_us"], flush=True)


if __name__ == "__main__":
    main()
