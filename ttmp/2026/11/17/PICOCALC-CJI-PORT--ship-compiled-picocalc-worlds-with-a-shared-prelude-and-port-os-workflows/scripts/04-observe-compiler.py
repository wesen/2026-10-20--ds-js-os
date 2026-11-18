"""Send a compiler command and observe board output without capturing user data."""
import argparse
import re
import time
import serial

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("command")
parser.add_argument("--timeout", type=float, default=100)
parser.add_argument("--port", default="/dev/serial/by-id/usb-1a86_USB_Single_Serial_5B61091051-if00")
args = parser.parse_args()
events = re.compile(r"cji:|dev-cji|CJI-CHECK|hello from the top|ELF:|abort\(|panic|register dump|MEPC|MTVAL|Guru|assert failed|watchdog|Rebooting|#OK key")
with serial.Serial(args.port, 115200, timeout=.15) as port:
    port.reset_input_buffer()
    port.write(("\n" + args.command + "\n").encode())
    start = time.monotonic()
    checked = False
    while time.monotonic() - start < args.timeout:
        line = port.readline().decode(errors="replace").strip()
        if line.startswith("[{") or "agent.state from" in line:
            continue
        if events.search(line):
            print(line, flush=True)
        if "assert failed" in line or "Guru Meditation" in line or "Rebooting..." in line:
            raise SystemExit("device restarted during compilation")
        if line.startswith("cji: ready"):
            break
        if line.startswith(("cji: build failed", "cji: staging write failed", "cji: cannot allocate", "cji: candidate failed")):
            raise SystemExit(1)
        if not checked and time.monotonic() - start > 2:
            port.write(b"\nkey f1\n")
            checked = True
    else:
        raise SystemExit("no completion observed")
