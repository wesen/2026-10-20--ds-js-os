#!/usr/bin/env python3
# Copy a file onto the ESP32-P4's FAT partition over the console, without resetting it: "put PATH" creates the file,
# then each "put PATH <base64>" line appends up to 680 bytes; the console acknowledges every command with "#OK put"
# before the next is sent. For WebAssembly apps: tools/p4put.py build/natives/echo.wasm apps/echo.wasm
#   tools/p4put.py LOCAL REMOTE [-p PORT]
import argparse, base64, sys, time
import serial

ap = argparse.ArgumentParser()
ap.add_argument("local")
ap.add_argument("remote")
ap.add_argument("-p", "--port", default="/dev/serial/by-id/usb-1a86_USB_Single_Serial_5B61091051-if00")
a = ap.parse_args()
data = open(a.local, "rb").read()
if " " in a.remote:
    sys.exit("the remote path cannot contain spaces")
ser = serial.Serial(a.port, 115200, timeout=0.05)
ser.reset_input_buffer()
buf = b""

def command(line, timeout=5.0):
    global buf
    reply = ""
    ser.write(b"\n" + line.encode() + b"\n")
    t0 = time.time()
    while time.time() - t0 < timeout:
        buf += ser.read(4096)
        while b"\n" in buf:
            l, buf = buf.split(b"\n", 1)
            l = l.decode(errors="replace").strip()
            if l.startswith("put "):
                reply = l
            if l == "#OK put":
                return reply
    sys.exit(f"no answer to {line[:60]}...")

print(command(f"put {a.remote}"))
reply = ""
for i in range(0, len(data), 680):
    reply = command(f"put {a.remote} {base64.b64encode(data[i:i + 680]).decode()}")
    if not reply.endswith(f": {min(i + 680, len(data))} bytes"):
        sys.exit(f"unexpected answer: {reply}")
print(reply)
ser.close()
