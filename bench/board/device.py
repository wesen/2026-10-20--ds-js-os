"""The PicoCalc on its serial port: the board lock, the firmware console, flashing, world health, install and restore.

Promoted (PICOCALC-REPO-LAYOUT Phase A) from the chain that board scripts loaded by path across four tickets:
SNAKE-INTEGRATION scripts/device/01-normal-snake.py (Console), NATIVE-PROMOTION scripts/device/common.py (esp, hold,
painter, ready), RAYTRACE scripts/device/board_common.py (check_build, health), CANDELA-WORLD scripts/lib/
board_health.py (health with the keyboard and display switched off by the user) and RAY-PARITY scripts/16 and 17
(restore, install, settle). Import it as `sys.path.insert(0, REPO/"bench/board"); import device`.

Every function that touches the board expects the caller to hold acquire(): one process at a time owns the port.
"""
import fcntl
import hashlib
import json
import os
import re
import subprocess
import time
from pathlib import Path

import serial

LOCK = Path(os.environ.get("PICOCALC_SERIAL_LOCK", "/tmp/pico-lab2-wave/original/serial.lock"))
PORT = os.environ.get("PICOCALC_PORT", "/dev/ttyACM0")
ESPTOOL = os.environ.get("PICOCALC_ESPTOOL", str(Path.home() / ".espressif/python_env/idf5.4_py3.11_env/bin/esptool.py"))
APP = "picocalc-os-p4.bin"
PART = "partition_table/partition-table.bin"
BOOT = "bootloader/bootloader.bin"
# The partition table every supported image shares; the app slot at 0x10000 holds at most 8 MiB.
PART_SHA = "72721dc3ce2597504dc568023e778100401a308455fea40d174d282386571d30"
APP_LIMIT = 8 * 1024 * 1024
# Worlds that must run natively on a healthy playable firmware, and the file each runs from.
NATIVE = {w: f"natives/{w}.elf" for w in ("compositor", "snake", "keyboard", "display")} | {
    w: f"{w}/compiled.bin" for w in ("files", "editor", "agenda", "chess")}
# With the keyboard and display switched off by the user, these are recorded but not judged.
PERIPHERAL_WORLDS = ("keyboard", "display", "compositor")
BUS = re.compile(r"bus (\S+)\s+busy\s+(\d+[.]\d+) ms, (\d+) transfers, (\d+) bytes, (\d+) errors")


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def save(path, value):
    Path(path).write_text(json.dumps(value, indent=2) + "\n")


def acquire():
    """The board lock, held for as long as the returned file stays open (use it in a with statement)."""
    LOCK.parent.mkdir(parents=True, exist_ok=True)
    f = LOCK.open("a")
    fcntl.flock(f, fcntl.LOCK_EX)
    return f


class Console:
    """The firmware's line console: commands answer with lines that end in "#OK <command>"."""

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

    def worlds(self, timeout=10):
        lines = self.command("worlds", timeout=timeout)
        return {w["name"]: w for w in next(json.loads(line) for line in lines if line.startswith('[{"name":'))}

    def native_healthy(self, deadline_s=30):
        """Wait until every NATIVE world runs natively from its file without an unexpected error."""
        deadline = time.monotonic() + deadline_s
        while time.monotonic() < deadline:
            try:
                worlds = self.worlds()
                if NATIVE.keys() <= worlds.keys() and all(
                        worlds[w]["engine"] == "native" and worlds[w]["file"] == NATIVE[w] and
                        (not worlds[w]["last_error"] or (w in self.expected_restarts and
                                                         worlds[w]["last_error"] == "restarted by an administrator")) and
                        worlds[w]["state"] not in {"crashed", "stopped", "restarting"} for w in NATIVE):
                    return worlds
            except (TimeoutError, ValueError, StopIteration):
                pass
            time.sleep(.2)
        raise RuntimeError("native worlds and peripheral drivers did not become healthy")

    def buses(self):
        found = {}
        for line in self.command("stats", timeout=10):
            m = BUS.search(line)
            if m:
                found[m[1]] = dict(zip(("busyMs", "transfers", "bytes", "errors"), (float(m[2]), int(m[3]), int(m[4]), int(m[5]))))
        return found

    def input_ready(self):
        """The physical keyboard answers: I2C0 transfers increase and its error count does not."""
        self.native_healthy()
        before = self.buses()["i2c0"]
        time.sleep(.4)
        after = self.buses()["i2c0"]
        if after["transfers"] <= before["transfers"] or after["errors"] != before["errors"]:
            raise ValueError(f"physical keyboard I2C0 did not qualify: {before} -> {after}")


def esp(op, build, out, tag, port=PORT, app=None):
    """write_flash or verify_flash of the app slot (and, for verify, the partition table) from a build directory."""
    args = [ESPTOOL, "--chip", "esp32p4", "-p", port, "-b", "921600",
            "--after", "hard_reset" if op == "verify_flash" else "no_reset", op, "0x10000", str(app or Path(build) / APP)]
    if op == "verify_flash" and app is None:
        args += ["0x8000", str(Path(build) / PART)]
    with (Path(out) / (tag + ".log")).open("wb") as f:
        subprocess.run(args, stdout=f, stderr=subprocess.STDOUT, check=True, timeout=210)


def hold(console):
    """Ask the firmware to reach its quiescent point (storage idle) before the port is used for flashing."""
    try:
        assert any("held between transactions" in line for line in console.command("hold", timeout=16))
    finally:
        console.close()


def painter(console):
    return next(json.loads(line) for line in console.command("painter") if line.startswith('{"sources"'))


def settle(console, limit=60):
    """Boot compiles run for seconds after a reset (Chess about 3.8 s); wait until no native world reads restarting."""
    deadline = time.monotonic() + limit
    while True:
        waiting = [n for n, w in console.worlds().items() if n in NATIVE and w.get("state") == "restarting"]
        if not waiting or time.monotonic() >= deadline:
            return waiting
        time.sleep(1)


def health(console, peripherals="on"):
    """World health after settling. peripherals "on": every native world healthy, the painter installed, and the
    physical keyboard answering. "off-by-user" (the user switched the keyboard and display off on purpose): the
    keyboard probe is skipped and the keyboard, display and compositor are recorded but not judged."""
    assert peripherals in ("on", "off-by-user"), peripherals
    still = settle(console)
    if peripherals == "on":
        worlds = console.native_healthy()
        deadline = time.monotonic() + 20
        while True:
            p = painter(console)
            if p["installed"] and p["calls"] and not p["rejects"]:
                break
            if time.monotonic() >= deadline:
                raise RuntimeError("painter " + str(p))
            time.sleep(.15)
        assert p["compiles"] == 1 and p["installed"] and p["rejects"] == 0, p
        assert all(worlds[k]["restarts"] == 0 for k in NATIVE), {k: worlds[k]["restarts"] for k in NATIVE}
        console.input_ready()
        buses = console.buses()
        return {"peripherals": "on", "worlds": sorted(NATIVE), "painter": p, "i2c": buses["i2c0"], "spi": buses["spi2"],
                "restartingAfterSettle": still}
    worlds = console.worlds()
    seen = {k: {f: worlds.get(k, {}).get(f) for f in ("engine", "file", "state", "restarts", "last_error")} for k in NATIVE}
    judged = [k for k in NATIVE if k not in PERIPHERAL_WORLDS]
    bad = [k for k in judged if seen[k]["engine"] != "native" or seen[k]["file"] != NATIVE[k]
           or seen[k]["state"] in ("crashed", "stopped", "restarting") or seen[k]["last_error"]]
    if bad:
        raise RuntimeError(f"native worlds unhealthy with peripherals off: {[(k, seen[k]) for k in bad]}")
    p = painter(console)
    if p["compiles"] != 1 or not p["installed"] or p["rejects"]:
        raise RuntimeError(f"painter {p}")
    buses = console.buses()
    return {"peripherals": "off by user", "keyboard": "off by user", "display": "off by user", "worlds": seen,
            "judged": judged, "painter": p, "i2c": buses.get("i2c0"), "spi": buses.get("spi2"), "restartingAfterSettle": still}


def check_build(build, digest=None):
    """A flashable build directory: the shared partition table, an app that fits, and (if given) the expected digest."""
    build = Path(build)
    assert sha(build / PART) == PART_SHA, f"{build}: partition table differs from the supported layout"
    assert (build / APP).stat().st_size <= APP_LIMIT, f"{build}: app larger than the 8 MiB slot"
    if digest is not None:
        assert sha(build / APP) == digest, f"{build}: app is not {digest}"
    return sha(build / APP)


def write_app(build, out, tag, port=PORT):
    """Write and verify the app slot from a build directory. The caller holds the lock; the firmware is not held."""
    esp("write_flash", build, out, tag + "-write", port)
    esp("verify_flash", build, out, tag + "-verify", port)


def install(build, out, peripherals="on", port=PORT, health_only=False):
    """Flash a build (unless health_only), wait for the boot compiles, check health. Returns the after-record."""
    digest = check_build(build)
    out = Path(out)
    out.mkdir(parents=True, exist_ok=False)
    with acquire(), (out / "uart.log").open("wb", buffering=0) as log:
        if not health_only:
            write_app(build, out, "install", port)
        console = Console(port, log)
        try:
            record = {"build": str(build), "sha256": digest, "health": health(console, peripherals)}
        finally:
            console.close()
    save(out / "after.json", record)
    return record


def run_app(app, out, restore_build, restore_sha, peripherals="on", port=PORT, deadline_s=300,
            begin=b"SIMDLAB BEGIN", end=b"SIMDLAB END"):
    """Time a standalone diagnostic app: verify the playable image already on the board, hold the firmware, write the
    app, capture its UART until `end`, then rewrite and verify the playable image and check its health.
    Writes out/{before,image,after}.json, bench.log and the esptool logs."""
    check_build(restore_build, restore_sha)
    out = Path(out)
    out.mkdir(parents=True, exist_ok=False)
    with acquire(), (out / "uart.log").open("wb", buffering=0) as log:
        console = Console(port, log)
        try:
            save(out / "before.json", health(console, peripherals))
        finally:
            console.close()
        hold(Console(port, log))
        esp("verify_flash", restore_build, out, "verified-prior", port)
        # verify_flash hard-resets the board; reach the quiescent point again before writing.
        console = Console(port, log)
        health(console, peripherals)
        hold(console)
        try:
            esp("write_flash", None, out, "trial-write", port, app=app)
            esp("verify_flash", None, out, "trial-verify", port, app=app)
            limit = time.monotonic() + deadline_s
            began = False
            with serial.Serial(port, 115200, timeout=.3) as stream, (out / "bench.log").open("wb", buffering=0) as bench:
                while time.monotonic() < limit:
                    line = stream.readline()
                    if not line:
                        continue
                    bench.write(line)
                    if begin in line:
                        began = True
                    elif end in line and began:
                        break
                    elif b"Guru Meditation" in line or b"assert failed" in line:
                        raise RuntimeError(line.decode(errors="replace").strip())
                else:
                    raise TimeoutError(f"no {end.decode()} within {deadline_s} s; inspect bench.log")
            save(out / "image.json", {"sha256": sha(app), "bytes": Path(app).stat().st_size, "port": port})
        finally:
            write_app(restore_build, out, "restore", port)
            console = Console(port, log)
            try:
                save(out / "after.json", {"sha256": restore_sha, "health": health(console, peripherals)})
            finally:
                console.close()
