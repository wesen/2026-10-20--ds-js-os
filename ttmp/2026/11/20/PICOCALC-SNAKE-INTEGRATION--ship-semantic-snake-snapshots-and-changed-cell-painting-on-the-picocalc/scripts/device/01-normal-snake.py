"""Measure and verify the normal PicoCalc Snake path under the shared serial lock."""
import argparse
import base64
import fcntl
import hashlib
import json
from pathlib import Path
import re
import signal
import struct
import subprocess
import time
import zlib

import serial

LOCK = Path("/tmp/pico-lab2-wave/original/serial.lock")
NATIVE = {w:f"natives/{w}.elf" for w in ("compositor","snake","keyboard","display")} | {
    w:f"{w}/compiled.bin" for w in ("files","editor","agenda","chess")
}
OBSERVED = {"compositor", "snake", "display"}
PARTITION = Path("partition_table/partition-table.bin")
APP = Path("picocalc-os-p4.bin")
BUS = re.compile(r"bus (\S+)\s+busy\s+(\d+[.]\d+) ms, (\d+) transfers, (\d+) bytes, (\d+) errors")
RLE = re.compile(rb"^[A-Za-z0-9+/]+=*$")
COLOR_BOUNDARY = 22


def digest(data):
    return hashlib.sha256(data).hexdigest()


class Console:
    def __init__(self, port, log):
        self.port = serial.Serial(port, 115200, timeout=.03)
        self.port.reset_input_buffer()
        self.log = log
        self.pending = b""
        self.expected_restarts = set()
        # Opening the CH343 can pulse EN. Drain startup before writing a command,
        # since UART receives commands only after the RTOS console task starts.
        ready = time.monotonic() + 13
        while time.monotonic() < ready:
            try:
                self.line(ready)
            except TimeoutError:
                break

    def close(self):
        self.port.close()

    def send(self, command):
        self.port.write(("\n" + command + "\n").encode())

    def line(self, deadline):
        while b"\n" not in self.pending:
            if time.monotonic() >= deadline:
                raise TimeoutError(self.pending[-100:])
            chunk = self.port.read(max(1, self.port.in_waiting))
            self.log.write(chunk)
            self.pending += chunk
        line, self.pending = self.pending.split(b"\n", 1)
        return line.rstrip(b"\r")

    def command(self, command, timeout=3):
        self.send(command)
        expected = "#OK " + command.split()[0]
        deadline = time.monotonic() + timeout
        lines = []
        while True:
            try:
                line = self.line(deadline).decode(errors="replace")
            except TimeoutError as exc:
                raise TimeoutError(f"{command}: {lines[-2:]}") from exc
            if line == expected:
                if command.startswith("restart "):
                    self.expected_restarts.add(command.split()[1])
                return lines
            lines.append(line)

    def health(self):
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            try:
                lines = self.command("worlds")
                worlds = {w["name"]: w for w in next(json.loads(line) for line in lines if line.startswith('[{"name":'))}
                if NATIVE.keys() <= worlds.keys() and all(worlds[w]["engine"] == "native" and
                    worlds[w]["file"] == NATIVE[w] and
                    (not worlds[w]["last_error"] or (w in self.expected_restarts and
                         worlds[w]["last_error"] == "restarted by an administrator")) and worlds[w]["state"] not in {"crashed", "stopped", "restarting"}
                    for w in NATIVE):
                    return worlds
            except (TimeoutError, ValueError, StopIteration):
                pass
            time.sleep(.2)
        raise RuntimeError("native worlds and peripheral drivers did not become healthy")

    def counters(self):
        worlds = self.health()
        stats = self.command("stats")
        buses = {}
        for line in stats:
            match = BUS.search(line)
            if match:
                buses[match[1]] = {k:t(v) for k,t,v in zip(("busyMs", "transfers", "bytes", "errors"),
                    (float, int, int, int), match.groups()[1:])}
        if not {"i2c0", "spi2"} <= buses.keys():
            raise RuntimeError("stats did not include I2C0 and SPI2 counters")
        return {name:{k: worlds[name][k] for k in ("turns", "cpu_ms", "restarts", "last_error")}
                for name in sorted(OBSERVED)} | buses

    def input_ready(self):
        before = self.counters()["i2c0"]
        time.sleep(.4)
        after = self.counters()["i2c0"]
        if after["transfers"] <= before["transfers"] or after["errors"] != before["errors"]:
            raise ValueError(f"physical keyboard I2C0 did not qualify: {before} -> {after}")

    def shot(self, label, out):
        self.send("shot")
        deadline = time.monotonic() + 15
        data, size, end, ack = [], None, None, False
        while not (end and ack):
            line = self.line(deadline)
            if line == b"#OK shot":
                ack = True
            elif line.startswith(b"#SHOT "):
                size = tuple(map(int,line.split()[1:]))
            elif line.startswith(b"#END "):
                end = line.split()
            elif size and not end and RLE.fullmatch(line):
                data.append(line.strip())
        w, h = size
        encoded = base64.b64decode(b"".join(data), validate=True)
        pixels = bytearray()
        for run, color in struct.iter_unpack("<HH", encoded):
            if not run or len(pixels) + run * 2 > w * h * 2:
                raise ValueError(f"invalid framebuffer RLE for {label}")
            pixels.extend(struct.pack("<H", color) * run)
        crc = zlib.crc32(pixels)
        if (w,h) != (320,320) or len(pixels) != w * h * 2 or crc != int(end[1],16):
            raise ValueError(f"invalid framebuffer CRC or geometry for {label}")
        (out / (label + ".rgb565")).write_bytes(pixels)
        png(out / (label + ".png"), w, h, pixels)
        return {"crc32": f"{crc:08x}", "sha256":digest(pixels),
                "appSha256":digest(pixels[COLOR_BOUNDARY * w * 2:])}


def png(path, w, h, pixels):
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        for i in range(y * w * 2, (y+1) * w * 2, 2):
            c = pixels[i] + 256 * pixels[i+1]
            raw.extend(((c >> 11) * 255 // 31, ((c >> 5) & 63) * 255 // 63, (c & 31) * 255 // 31))
    def chunk(kind, data):
        return struct.pack(">I",len(data)) + kind + data + struct.pack(">I",zlib.crc32(kind+data))
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR",struct.pack(">IIBBBBB",w,h,8,2,0,0,0)) +
                     chunk(b"IDAT",zlib.compress(raw)) + chunk(b"IEND",b""))


def observe(console, out, blocks, profile, system_check, memory_keys):
    if memory_keys:
        if "snake observer: memory keys" not in console.command("snakeobs memory-keys",timeout=10):
            raise ValueError("instrumented keyboard status register unavailable")
    else:
        console.input_ready()
    r = {"worlds": {w:{k:v[k] for k in ("engine","file","last_error","state")}
                    for w,v in console.health().items() if w in NATIVE},
         "blocks":[], "screens":{},
         "inputMode":"instrumented keyboard status register" if memory_keys else "physical keyboard controller"}
    for attempt in range(blocks):
        console.command("key f1")
        console.command("restart snake")
        time.sleep(1.85)   # Let the restart banner expire before the timing window.
        before = console.counters()
        if profile:
            console.command("snakeobs begin")
        console.command("key s")
        time.sleep(.30)  # The launcher and compositor must complete the open/focus messages.
        console.command("key p")
        began = time.monotonic()
        time.sleep(max(0, 2.5 + began - time.monotonic()))
        console.command("key f1")
        elapsed = time.monotonic() - began
        time.sleep(.25)   # Let pending display work settle after returning to the launcher.
        observed = next(json.loads(x) for x in console.command("snakeobs end") if x.startswith("{")) if profile else None
        after = console.counters()
        delta = {name:{k:round(after[name][k]-before[name][k],3) for k in keys}
                 for name,keys in {"snake":("turns","cpu_ms","restarts"),"compositor":("turns","cpu_ms","restarts"),
                                   "display":("turns","cpu_ms","restarts"),"spi2":("busyMs","transfers","bytes","errors"),
                                   "i2c0":("busyMs","transfers","bytes","errors")}.items()}
        if any(delta[name]["restarts"] for name in OBSERVED) or delta["spi2"]["errors"]             or (not memory_keys and delta["i2c0"]["errors"]) or not delta["spi2"]["bytes"]:
            raise ValueError(f"bad gameplay counters in block {attempt}: {delta}")
        row = {"sequence":attempt,"runningHostMs":round(elapsed*1000,3),
               "before":before,"after":after,"delta":delta}
        if profile:
            row["instrumented"] = observed
        r["blocks"].append(row)

    # Screenshot work runs outside the measurement intervals. These checks use
    # the actual launcher, switch focus, recover from death, and reattach the display.
    console.command("key f1")
    console.command("restart snake")
    time.sleep(1.85)
    console.command("key s")
    time.sleep(2.25)
    r["screens"]["death"] = console.shot("death",out)
    console.command("key enter")
    console.command("key f1")
    time.sleep(.32)
    r["screens"]["home"] = console.shot("home",out)
    console.command("key s")
    time.sleep(2.25)
    r["screens"]["death-after-reentry"] = console.shot("death-after-reentry",out)
    if r["screens"]["death"]["appSha256"] == r["screens"]["home"]["appSha256"]:
        raise ValueError("Snake did not open and return through the launcher")
    console.command("key enter")
    console.command("key p")
    time.sleep(2.5)
    r["screens"]["autopilot"] = console.shot("autopilot",out)
    console.command("key f1")
    console.command("restart compositor")
    time.sleep(1.85)
    console.health()
    console.command("key s")
    time.sleep(.5)
    r["screens"]["after-compositor-restart"] = console.shot("after-compositor-restart",out)
    console.command("key f1")
    if system_check:
        world_before = console.health()["compositor"]
        console.command("key m")
        time.sleep(1.1)
        r["screens"]["system-worlds"] = console.shot("system-worlds",out)
        console.command("key f1")
        time.sleep(.35)
        world_after = console.health()
        comps = world_after["compositor"]
        r["systemCheck"] = {
            "compositorRestartDelta": comps["restarts"] - world_before["restarts"],
            "compositorLastErrorBefore": world_before["last_error"],
            "compositorLastErrorAfter": comps["last_error"],
            "systemLastError":world_after["sysmon"]["last_error"],
        }
        if (r["systemCheck"]["compositorRestartDelta"] != 0 or world_after["sysmon"]["last_error"] or
            comps["last_error"] != world_before["last_error"]):
            raise ValueError(f"System Worlds regression: {r['systemCheck']}")
    return r


def interrupt(*_):
    raise KeyboardInterrupt("board test interrupted")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("output",type=Path)
    p.add_argument("--port",default="/dev/ttyACM0")
    p.add_argument("--blocks",type=int,default=6)
    p.add_argument("--baseline",type=Path,required=True,help="previous verified playable build directory")
    p.add_argument("--flash",type=Path,help="candidate build directory")
    p.add_argument("--esptool",type=Path,required=True)
    p.add_argument("--profile",action="store_true")
    p.add_argument("--system-check",action="store_true")
    p.add_argument("--memory-keys",action="store_true",help="test-only keyboard register substitute in a matching profile build")
    p.add_argument("--boot-only",action="store_true",help="verify flash and normal boot without gameplay")
    p.add_argument("--restore",action="store_true",help="restore verified playable baseline after a temporary measurement image")
    args = p.parse_args()
    signal.signal(signal.SIGTERM, interrupt)
    out = args.output
    out.mkdir(parents=True,exist_ok=False)
    if args.memory_keys and not args.profile:
        p.error("--memory-keys requires --profile")
    if args.restore and not args.flash:
        p.error("--restore requires --flash")
    image = args.baseline if not args.flash else args.flash
    original_partition = (args.baseline / PARTITION).read_bytes()
    if original_partition != (image / PARTITION).read_bytes() or (image / APP).stat().st_size >= 0x800000:
        raise ValueError("candidate partition map or app size differs from the supported image layout")

    def esp(label, action, build, partitions=False):
        cmd = [str(args.esptool),"--chip","esp32p4","-p",args.port,"-b","921600",
               action,"0x10000",str(build / APP)]
        if partitions:
            cmd += ["0x8000", str(build / PARTITION)]
        with (out / (label + ".log")).open("wb") as log:
            subprocess.run(cmd,check=True,stdout=log,stderr=subprocess.STDOUT,timeout=160)

    with LOCK.open("a") as guard, (out / "uart.log").open("wb") as log:
        fcntl.flock(guard,fcntl.LOCK_EX)
        console = Console(args.port,log)
        attempted = False
        try:
            if not args.flash:
                assert any("held between transactions" in l for l in console.command("hold",timeout=16))
                console.close()
                esp("verified-before", "verify_flash", image, partitions=True)
                console = Console(args.port,log)
            if args.flash:
                assert any("held between transactions" in l for l in console.command("hold",timeout=16))
                console.close()
                attempted = True
                esp("candidate", "write_flash", image)
                console = Console(args.port,log)
            if args.boot_only:
                worlds = console.health()
                r = {"worlds": {w:{k:v[k] for k in ("engine","file","last_error","state")}
                               for w,v in worlds.items() if w in NATIVE},
                     "bootsOnly":True,"counters":console.counters()}
            else:
                r = observe(console,out,args.blocks,args.profile,args.system_check,args.memory_keys)
            r["imageSha256"] = digest((image / APP).read_bytes())
            r["partitionSha256"] = digest(original_partition)
            r["appAndPartitionVerified"] = not args.flash
            if args.flash and not args.restore:
                assert any("held between transactions" in l for l in console.command("hold",timeout=16))
                console.close()
                esp("verified-after","verify_flash",image,partitions=True)
                console = Console(args.port,log)
                console.health()
                r["appAndPartitionVerified"] = True
            (out / "receipt.json").write_text(json.dumps(r,indent=2)+"\n")
        except BaseException:
            args.restore = attempted
            raise
        finally:
            if args.restore and attempted:
                try:
                    console.command("hold", timeout=2)
                except (OSError, TimeoutError, serial.SerialException):
                    pass
                console.close()
                esp("restore","write_flash",args.baseline)
                console = Console(args.port,log)
                console.health()
                console.command("hold",timeout=16)
                console.close()
                esp("restore-verify","verify_flash",args.baseline,partitions=True)
                console = Console(args.port,log)
                console.health()
            console.close()


if __name__ == "__main__":
    main()
