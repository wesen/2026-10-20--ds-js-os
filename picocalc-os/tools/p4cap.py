#!/usr/bin/env python3
# Reset the ESP32-P4 through the CH343's DTR/RTS lines (DTR released: normal boot; RTS pulses EN) and print
# what arrives on the console for a few seconds. One process may own the port at a time.
#   tools/p4cap.py [-p PORT] [-s SECONDS] [--no-reset] [-c "AT_SECONDS COMMAND"]... [--shot-dir DIR]
# With --shot-dir, every "#SHOT w h" ... "#END crc runs" block the console's shot command prints is decoded
# (base64 of little-endian (count, rgb565) pairs) and written there as shot-N.png at scale 2.
import argparse, base64, os, struct, sys, time, zlib
import serial

ap = argparse.ArgumentParser()
ap.add_argument("-p", "--port", default="/dev/serial/by-id/usb-1a86_USB_Single_Serial_5B61091051-if00")
ap.add_argument("-s", "--seconds", type=float, default=8)
ap.add_argument("--no-reset", action="store_true")
ap.add_argument("--shot-dir")
ap.add_argument("-c", "--cmd", action="append", default=[], help='"SECONDS COMMAND": send a console line at that time')
a = ap.parse_args()
ser = serial.Serial(a.port, 115200, timeout=0.05)
ser.reset_input_buffer()
if not a.no_reset:
    ser.dtr = False   # IO0 high: boot the app, not the ROM downloader
    ser.rts = True    # EN low: hold the chip in reset
    time.sleep(0.12)
    ser.rts = False   # EN high: run
log = b""
cmds = sorted((float(c.split(" ", 1)[0]), c.split(" ", 1)[1]) for c in a.cmd)
t0 = time.time()
while time.time() - t0 < a.seconds:
    while cmds and time.time() - t0 >= cmds[0][0]:
        ser.write(("\n" + cmds.pop(0)[1] + "\n").encode())   # a newline first: the reset can leave a stray byte
    d = ser.read(4096)
    log += d
    if d:
        sys.stdout.buffer.write(d); sys.stdout.buffer.flush()
ser.close()


def png(path, w, h, px, scale=2):
    rows = []
    for y in range(h):
        row = bytearray()
        for x in range(w):
            v = px[y * w + x]
            rgb = bytes((((v >> 11) & 31) * 255 // 31, ((v >> 5) & 63) * 255 // 63, (v & 31) * 255 // 31))
            row += rgb * scale
        rows += [b"\0" + bytes(row)] * scale
    raw = b"".join(rows)
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d))
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w * scale, h * scale, 8, 2, 0, 0, 0))
                + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b""))


if a.shot_dir:
    os.makedirs(a.shot_dir, exist_ok=True)
    lines = log.decode("utf-8", "replace").splitlines()
    n = 0
    for i, l in enumerate(lines):
        if not l.startswith("#SHOT ") or l.startswith("#SHOT none"):
            continue
        w, h = map(int, l.split()[1:3])
        data = bytearray()
        for k in lines[i + 1:]:
            if k.startswith("#END"):
                crc = int(k.split()[1], 16)
                break
            data += base64.b64decode(k.strip())
        px = []
        for off in range(0, len(data) - 3, 4):
            c, v = struct.unpack_from("<HH", data, off)
            px += [v] * c
        ok = len(px) == w * h and zlib.crc32(struct.pack("<%dH" % len(px), *px)) == crc
        n += 1
        path = os.path.join(a.shot_dir, "shot-%d.png" % n)
        if ok:
            png(path, w, h, px)
        print("\n[p4cap] shot %d: %s (%s)" % (n, path if ok else "-", "crc ok" if ok else "BAD: %d px" % len(px)), file=sys.stderr)
