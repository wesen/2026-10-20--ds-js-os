#!/usr/bin/env python3
"""Talk to picocalc-os on the M5Stack PaperS3 over its native USB Serial/JTAG, and decode screenshots.

    tools/s3cap.py [-p PORT] [-s SECONDS] [--no-reset] [-c "AT_SECONDS COMMAND"]... [--shot-dir DIR] [-o LOG]

The PaperS3's console needs care (esp32-s3-m5 ESP-55): on this host every open of /dev/ttyACM0 asserts DTR
and RTS, and the edges can leave the ESP32-S3 in its ROM downloader ("boot:0x0 (DOWNLOAD)", the console then
looks dead). So the port is opened once; unless --no-reset, the chip is reset into the app through the held
descriptor (DTR=RTS=0, then RTS=1 holds EN low, then RTS=0 releases it with GPIO0 high); and the descriptor stays
open for the whole run so no further modem edges happen. Output arrives only while a reader is attached, and the
device re-enumerates after a reset, so the port is reopened if it disappears.

With --shot-dir, every "#SHOT w h g8" ... "#END crc runs" block (base64 of (count low, count high, gray)
records, the console's shot command) is written there as shot-N.png at its native size.
"""
import argparse, base64, fcntl, os, re, select, struct, sys, termios, time, zlib

DEFAULT_PORT = "/dev/serial/by-id/usb-Espressif_USB_JTAG_serial_debug_unit_D0:CF:13:16:17:DC-if00"
B64 = re.compile(r"^[A-Za-z0-9+/]+=*$")


def set_modem(fd, dtr, rts):
    TIOCMGET, TIOCMSET, DTR, RTS = 0x5415, 0x5418, 0x002, 0x004
    bits = struct.unpack("I", fcntl.ioctl(fd, TIOCMGET, struct.pack("I", 0)))[0]
    bits = (bits | DTR) if dtr else (bits & ~DTR)
    bits = (bits | RTS) if rts else (bits & ~RTS)
    fcntl.ioctl(fd, TIOCMSET, struct.pack("I", bits))


def open_port(path, wait):
    deadline = time.monotonic() + wait
    while True:
        try:
            fd = os.open(path, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
            break
        except OSError:
            if time.monotonic() > deadline:
                raise
            time.sleep(0.2)
    attrs = termios.tcgetattr(fd)
    attrs[0] = attrs[1] = attrs[3] = 0
    attrs[6][termios.VMIN] = attrs[6][termios.VTIME] = 0
    termios.tcsetattr(fd, termios.TCSANOW, attrs)
    return fd


def save_png(path, w, h, gray):
    raw = b"".join(b"\x00" + bytes(gray[y * w:(y + 1) * w]) for y in range(h))
    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 0, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b""))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-p", "--port", default=DEFAULT_PORT)
    ap.add_argument("-s", "--seconds", type=float, default=15)
    ap.add_argument("--no-reset", action="store_true")
    ap.add_argument("--shot-dir")
    ap.add_argument("-o", "--log")
    ap.add_argument("-c", "--cmd", action="append", default=[], help='"SECONDS COMMAND": send a console line at that time')
    a = ap.parse_args()
    log = open(a.log, "w") if a.log else None
    cmds = sorted((float(c.split(" ", 1)[0]), c.split(" ", 1)[1]) for c in a.cmd)
    fd = open_port(a.port, 10)
    if not a.no_reset:
        set_modem(fd, False, False); time.sleep(0.2)
        set_modem(fd, False, True); time.sleep(0.2)
        set_modem(fd, False, False)
    t0, buf, shot, shots = time.monotonic(), b"", None, 0
    while time.monotonic() - t0 < a.seconds:
        while cmds and time.monotonic() - t0 >= cmds[0][0]:
            line = cmds.pop(0)[1]
            try:
                os.write(fd, ("\n" + line + "\n").encode())
            except OSError:
                pass
            print(f"# >>> {line}", flush=True)
        r, _, _ = select.select([fd], [], [], 0.05)
        if not r:
            continue
        try:
            chunk = os.read(fd, 65536)
        except OSError:   # the device went away (a reset re-enumerates it): reopen
            os.close(fd)
            fd = open_port(a.port, 10)
            continue
        if not chunk:
            continue
        buf += chunk
        while b"\n" in buf:
            raw, buf = buf.split(b"\n", 1)
            line = raw.decode("utf-8", "replace").rstrip("\r")
            if shot is not None:
                if line.startswith("#END"):
                    data = shot["data"]
                    gray, i = bytearray(), 0
                    while i + 3 <= len(data):
                        gray += bytes([data[i + 2]]) * (data[i] | data[i + 1] << 8); i += 3
                    want = shot["w"] * shot["h"]
                    crc = zlib.crc32(bytes(gray[:want])) & 0xffffffff
                    ok = len(gray) == want and f"{crc:08x}" == line.split()[1]
                    shots += 1
                    if a.shot_dir:
                        os.makedirs(a.shot_dir, exist_ok=True)
                        path = os.path.join(a.shot_dir, f"shot-{shots}.png")
                        save_png(path, shot["w"], shot["h"], gray[:want] + bytearray(max(0, want - len(gray))))
                        print(f"# shot {shots}: {path} ({'crc ok' if ok else 'CRC MISMATCH'})", flush=True)
                    shot = None
                elif B64.match(line):
                    shot["data"] += base64.b64decode(line)
                continue
            m = re.match(r"#SHOT (\d+) (\d+) g8", line)
            if m:
                shot = {"w": int(m.group(1)), "h": int(m.group(2)), "data": b""}
                continue
            print(line, flush=True)
            if log:
                log.write(line + "\n")
    os.close(fd)


main()
