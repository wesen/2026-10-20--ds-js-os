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
UPTIME = re.compile(r"^t = (\d+(?:[.]\d+)?) ms")
# A health check judges only a boot it can account for: a board up longer than this when the check starts is
# rebooted first, so errors left from hours ago (a keyboard wedge, a "power cycle" that USB kept powered) are gone.
FRESH_S = 120
# Bus health is judged on the change over this window, not on counters that run from boot.
BUS_WINDOW_S = 5
PAINTER_S = 30


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
    """The firmware's line console: commands answer with lines that end in "#OK <command>".

    `port` is a device path or an object with pyserial's read/write/in_waiting (the tests' fake port)."""

    def __init__(self, port, log, drain_s=13):
        self.port = serial.Serial(port, 115200, timeout=.03) if isinstance(port, (str, os.PathLike)) else port
        self.port.reset_input_buffer()
        self.log = log
        self.pending = b""
        self.expected_restarts = set()
        # Opening the CH343 can pulse EN. Drain startup before writing a command,
        # since UART receives commands only after the RTOS console task starts.
        self.drain(drain_s)

    def close(self):
        self.port.close()

    def send(self, command):
        self.port.write(("\n" + command + "\n").encode())

    def drain(self, seconds):
        """Read (and log) whatever the board prints for `seconds`."""
        deadline = time.monotonic() + seconds
        try:
            while True:
                self.line(deadline)
        except TimeoutError:
            pass

    def line(self, deadline):
        """The next line. The deadline is absolute: once it has passed, TimeoutError, even with lines still buffered."""
        while True:
            if time.monotonic() >= deadline:
                raise TimeoutError(self.pending[-100:])
            if b"\n" in self.pending:
                line, self.pending = self.pending.split(b"\n", 1)
                return line.rstrip(b"\r")
            chunk = self.port.read(max(1, self.port.in_waiting))
            self.log.write(chunk)
            self.pending += chunk

    def command(self, command, timeout=3):
        """The lines a command prints before its "#OK", or TimeoutError `timeout` seconds after sending it, however
        many other lines (the gallery's CGAL records, the kernel log) arrive meanwhile. The "#OK" may end a line that
        another task's output began; that output is kept as a line of its own."""
        self.send(command)
        expected = "#OK " + command.split()[0]
        deadline = time.monotonic() + timeout
        lines = []
        while True:
            try:
                line = self.line(deadline).decode(errors="replace")
            except TimeoutError as exc:
                raise TimeoutError(f"{command}: {lines[-2:]}") from exc
            if line.endswith(expected):
                if len(line) > len(expected):
                    lines.append(line[:-len(expected)])
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

    def uptime_ms(self, deadline_s=30):
        """The kernel clock (`stats` prints "t = X ms" first): milliseconds since the firmware booted. Boot compiles
        keep the kernel from answering for seconds, so a timed-out `stats` is asked again until deadline_s."""
        deadline = time.monotonic() + deadline_s
        while True:
            try:
                for line in self.command("stats", timeout=10):
                    m = UPTIME.match(line)
                    if m:
                        return float(m[1])
                raise ValueError("stats printed no kernel clock")
            except TimeoutError:
                if time.monotonic() >= deadline:
                    raise

    def reboot(self, drain_s=13):
        """Restart the firmware from its console. `reboot` first holds i2c0 between transactions (a reset in the
        middle of a keyboard transfer is what wedges the keyboard controller), then calls esp_restart(); it prints
        "rebooting" and never "#OK". The port stays open: the CH343 is not reset."""
        self.send("reboot")
        deadline = time.monotonic() + 10
        try:
            while "rebooting" not in self.line(deadline).decode(errors="replace"):
                pass
        except TimeoutError as exc:
            raise RuntimeError("the firmware did not answer reboot") from exc
        self.expected_restarts.clear()
        self.drain(drain_s)

    def bus_window(self, seconds=None):
        """What every bus did over the last `seconds` (BUS_WINDOW_S): the transfers, bytes, errors and busy time added
        ("deltas"), next to the counters since boot ("totals"), which tell a bus's history, not its health."""
        before, t0 = self.buses(), time.monotonic()
        time.sleep(BUS_WINDOW_S if seconds is None else seconds)
        after, t1 = self.buses(), time.monotonic()
        deltas = {name: {k: round(after[name][k] - before[name][k], 2) for k in ("transfers", "bytes", "errors", "busyMs")}
                  for name in sorted(before.keys() & after.keys())}
        return {"seconds": round(t1 - t0, 2), "deltas": deltas, "totals": after}


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
    """The painter's counters, or None when the reply was lost: another task's line printed in pieces (a compile's
    TYPEDCOMPILE record) can take the reply into its middle, so the record is looked for anywhere in a line."""
    for line in console.command("painter"):
        at = line.find('{"sources"')
        if at >= 0:
            try:
                return json.loads(line[at:])
            except ValueError:
                pass
    return None


def wait_painter(console, calls, deadline_s=PAINTER_S):
    """Chess hands the painter its sources some seconds after the boot compiles (later still with the display off):
    poll until it is installed without rejects (and, if `calls`, has been called), or raise at the deadline."""
    deadline = time.monotonic() + deadline_s
    while True:
        p = painter(console)
        if p and p["installed"] and not p["rejects"] and (p["calls"] or not calls):
            return p
        if time.monotonic() >= deadline:
            raise RuntimeError("painter " + str(p))
        time.sleep(.15)


def settle(console, limit=60):
    """Boot compiles run for seconds after a reset (Chess about 3.8 s); wait until no native world reads restarting."""
    deadline = time.monotonic() + limit
    while True:
        waiting = [n for n, w in console.worlds().items() if n in NATIVE and w.get("state") == "restarting"]
        if not waiting or time.monotonic() >= deadline:
            return waiting
        time.sleep(1)


def fresh_boot(console, limit_s=FRESH_S):
    """Make the errors a health check judges belong to a boot it can account for. The `worlds` report has no time
    for an error and its counters run from boot, so on a board up for longer than limit_s (a health-only check, a
    "power cycle" that USB kept powered) the firmware is rebooted first. Returns the uptime the check starts from."""
    up = console.uptime_ms()
    if up <= limit_s * 1000:
        return {"uptimeMs": up, "rebooted": False}
    console.reboot()
    after = console.uptime_ms()
    if after > limit_s * 1000:
        raise RuntimeError(f"the firmware did not restart: uptime {up:.0f} ms before reboot, {after:.0f} ms after")
    return {"uptimeMs": after, "rebooted": True, "uptimeBeforeMs": up}


def health(console, peripherals="on"):
    """World health of a fresh boot (fresh_boot) after settling, with what every bus did over BUS_WINDOW_S.
    peripherals "on": every native world healthy, the painter installed and called, and the physical keyboard
    answering (i2c0 transfers over the window, none of them errors). "off-by-user" (the user switched the keyboard
    and display off on purpose): the painter is waited for in the same way; the keyboard, display, compositor and
    buses are recorded but not judged."""
    assert peripherals in ("on", "off-by-user"), peripherals
    boot = fresh_boot(console)
    still = settle(console)
    if peripherals == "on":
        worlds = console.native_healthy()
        p = wait_painter(console, calls=True)
        assert p["compiles"] == 1 and p["installed"] and p["rejects"] == 0, p
        assert all(worlds[k]["restarts"] == 0 for k in NATIVE), {k: worlds[k]["restarts"] for k in NATIVE}
        buses = console.bus_window()
        i2c = buses["deltas"].get("i2c0")
        if not i2c or i2c["transfers"] <= 0 or i2c["errors"]:
            raise ValueError(f"physical keyboard I2C0 did not qualify over {buses['seconds']} s: {i2c}")
        return {"peripherals": "on", "boot": boot, "worlds": sorted(NATIVE), "painter": p, "buses": buses,
                "restartingAfterSettle": still}
    worlds = console.worlds()
    seen = {k: {f: worlds.get(k, {}).get(f) for f in ("engine", "file", "state", "restarts", "last_error")} for k in NATIVE}
    judged = [k for k in NATIVE if k not in PERIPHERAL_WORLDS]
    bad = [k for k in judged if seen[k]["engine"] != "native" or seen[k]["file"] != NATIVE[k]
           or seen[k]["state"] in ("crashed", "stopped", "restarting") or seen[k]["last_error"]]
    if bad:
        raise RuntimeError(f"native worlds unhealthy with peripherals off: {[(k, seen[k]) for k in bad]}")
    p = wait_painter(console, calls=False)
    if p["compiles"] != 1:
        raise RuntimeError(f"painter {p}")
    return {"peripherals": "off by user", "keyboard": "off by user", "display": "off by user", "boot": boot,
            "worlds": seen, "judged": judged, "painter": p, "buses": console.bus_window(), "restartingAfterSettle": still}


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


def quiesce(port, log):
    """hold the running firmware before esptool resets it, so the reset cannot land in the middle of a keyboard
    transfer (an ESP32-only reset there is the suspected cause of the keyboard controller wedging). Best effort: an
    image without the console (a study app) or a hung one cannot hold, and a restore must still go ahead."""
    try:
        hold(Console(port, log, drain_s=1))
        return True
    except (AssertionError, TimeoutError, serial.SerialException):
        return False


def install(build, out, peripherals="on", port=PORT, health_only=False):
    """Flash a build (unless health_only), wait for the boot compiles, check health. Returns the after-record."""
    digest = check_build(build)
    out = Path(out)
    out.mkdir(parents=True, exist_ok=False)
    with acquire(), (out / "uart.log").open("wb", buffering=0) as log:
        record = {"build": str(build), "sha256": digest}
        if not health_only:
            record["heldBeforeFlash"] = quiesce(port, log)
            write_app(build, out, "install", port)
        console = Console(port, log)
        try:
            record["health"] = health(console, peripherals)
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
