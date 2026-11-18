"""Measure fresh compiler realms, cold WAMR instances, and first file-backed frames."""
import argparse
import json
import re
import statistics
import sys
import time

import serial


COMPILE = re.compile(r"agenda compile source=(\w+) status=(\w+) us=(\d+) peak_js_bytes=(\d+) wasm_bytes=(\d+)")
RESPONSE = re.compile(r"agenda response us=(\d+) world_bytes=(\d+)")
FRAME = re.compile(r"agenda frame turn_us=(\d+) world_bytes=(\d+)")


def one(ser, command):
    ser.reset_input_buffer()
    ser.write(f"\nagenda {command}\n".encode())
    deadline = time.monotonic() + 8
    result = None
    while time.monotonic() < deadline:
        line = ser.readline().decode(errors="replace").strip()
        compile_data = COMPILE.search(line)
        if compile_data:
            _, status, elapsed, heap, length = compile_data.groups()
            if status != "ok":
                raise RuntimeError(line)
            result = dict(compile_us=int(elapsed), peak_js_bytes=int(heap), wasm_bytes=int(length))
        response = RESPONSE.search(line)
        if result and response:
            result["first_response_us"], result["world_bytes"] = map(int, response.groups())
        frame = FRAME.search(line)
        if result and "first_response_us" in result and frame:
            result["frame_turn_us"] = int(frame.group(1))
            return result
        if line and (line.startswith("agenda") or "] agenda" in line) and "restarted by an administrator" not in line:
            print(line, file=sys.stderr)
    raise TimeoutError(f"{command}: no file-backed response")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", default="/dev/ttyACM0")
    parser.add_argument("--runs", type=int, default=20)
    parser.add_argument("--settle", type=float, default=6, help="allow the firmware to settle after opening serial")
    parser.add_argument("--source", choices=("baseline", "build"), default="baseline")
    args = parser.parse_args()
    if args.runs < 1:
        parser.error("--runs must be positive")
    ser = serial.Serial(port=None, baudrate=115200, timeout=0.5)
    ser.dtr = ser.rts = False
    ser.port = args.port
    ser.open()
    try:
        time.sleep(args.settle)
        trials = [one(ser, args.source) for _ in range(args.runs)]
    finally:
        ser.close()
    response = sorted(row["first_response_us"] for row in trials)
    receipt = {
        "source": args.source, "trials": trials,
        "median_response_us": statistics.median(response),
        "p95_response_us": response[(95 * len(response) + 99) // 100 - 1],
        "max_response_us": response[-1],
    }
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
