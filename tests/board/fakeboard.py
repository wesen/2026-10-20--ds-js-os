"""A PicoCalc console on a virtual clock, for testing bench/board/device.py without the board.

FakeBoard implements the pyserial calls device.Console makes (read, write, in_waiting, reset_input_buffer, close) and
answers the console commands the harness sends (worlds, stats, painter, hold, reboot) the way the P4 firmware does
(firmware/port/esp32p4/main/main_p4.c, firmware/nucleus/kernel_reports.c). Output takes the wire time of 115200
baud. Clock replaces the `time` module inside device, so deadlines and sleeps cost no real time.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "bench/board"))
import device  # noqa: E402

BYTE_S = 10 / 115200


class Clock:
    """monotonic, time and sleep on a virtual clock."""

    def __init__(self, now=1000.0):
        self.now = now

    def monotonic(self):
        return self.now

    def time(self):
        return self.now

    def sleep(self, seconds):
        self.now += max(0.0, seconds)


class FakeBoard:
    def __init__(self, clock, uptime_s=20.0):
        self.clock = clock
        self.timeout = .03               # the read timeout device.Console opens the port with
        self.boot_at = clock.now - uptime_s
        self.out = []                    # [due time, bytes], in due order
        self.last_due = 0.0
        self.inbuf = b""
        self.commands = []               # (time, command) as received
        self.reboots = 0
        # The firmware's behaviour; tests change these before talking to it.
        self.console_ready_s = 1.5       # commands sent earlier in a boot are lost (the console task is not up)
        self.settle_s = 4.0              # native worlds read "restarting" until then (boot compiles)
        self.painter_after_s = 8.0       # Chess hands the painter its sources at this uptime
        self.display_on = True           # the painter is called only while the display shows frames
        self.i2c_rate, self.i2c_error_rate = 50.0, 0.0   # keyboard polls per second; NACKs per second
        self.spi_rate = 30.0
        self.history = {"i2c0": (0, 0)}  # (transfers, errors) counted before now in this boot (a wedge long ago)
        self.stale = {}                  # world -> last_error left from earlier in this boot
        self.each_boot = {}              # world -> last_error that every boot produces (a real fault)
        self.silent = set()              # commands the firmware never answers
        self.ok_prefix = {}              # command -> text another task printed just before its "#OK"
        self.stream_period = None        # a CGAL record every this many seconds (the gallery drawing)
        self.stream_next = None
        self.stream_count = 0
        self.painter_answers = []

    # ---- the pyserial side ----------------------------------------------------------------------------------
    def reset_input_buffer(self):
        self._produce()
        self.out = [o for o in self.out if o[0] > self.clock.now]

    def close(self):
        pass

    @property
    def in_waiting(self):
        self._produce()
        return sum(len(b) for due, b in self.out if due <= self.clock.now)

    def read(self, n):
        self._produce()
        if not self.in_waiting:
            due = [o[0] for o in self.out] + ([self.stream_next] if self.stream_next is not None else [])
            self.clock.now = min([self.clock.now + self.timeout] + [d for d in due if d > self.clock.now])
            self._produce()
        data = b""
        while self.out and self.out[0][0] <= self.clock.now and len(data) < n:
            due, chunk = self.out[0]
            take = chunk[:n - len(data)]
            data += take
            if len(take) == len(chunk):
                self.out.pop(0)
            else:
                self.out[0][1] = chunk[len(take):]
        return data

    def write(self, data):
        self._produce()
        self.inbuf += data
        while b"\n" in self.inbuf:
            line, self.inbuf = self.inbuf.split(b"\n", 1)
            if line.strip():
                self._command(line.decode().strip())
        return len(data)

    # ---- the firmware side ----------------------------------------------------------------------------------
    @property
    def up(self):
        return self.clock.now - self.boot_at

    def stream(self, period):
        self.stream_period, self.stream_next = period, self.clock.now

    def _emit(self, text, at=None, latency=.005):
        data = text.encode()
        due = max(self.last_due, (self.clock.now if at is None else at) + latency)
        self.last_due = due + len(data) * BYTE_S
        self.out.append([self.last_due, data])

    def _produce(self):
        while self.stream_next is not None and self.stream_next <= self.clock.now:
            self._emit('CGAL {"ev":"pass","id":"R-01","pass":%d,"renderMs":812.5}\n' % self.stream_count, at=self.stream_next)
            self.stream_count += 1
            self.stream_next += self.stream_period

    def _command(self, line):
        self.commands.append((self.clock.now, line))
        cmd = line.split()[0]
        if self.up < self.console_ready_s or cmd in self.silent:
            return
        if cmd == "worlds":
            body = json.dumps(self._worlds(), separators=(",", ":")) + "\n"
        elif cmd == "stats":
            body = self._stats()
        elif cmd == "painter":
            body = json.dumps(self._painter(), separators=(",", ":")) + "\n"
        elif cmd == "hold":
            body = "i2c0 held between transactions; reboot or flash now\n"
        elif cmd == "reboot":
            self._emit("i2c0 held; rebooting\n")
            self._reboot()
            return
        else:
            body = f"unknown command {cmd} (try help)\n"
        self._emit(body + self.ok_prefix.get(cmd, "") + f"#OK {cmd}\n")

    def _reboot(self):
        self.reboots += 1
        self.boot_at = self.last_due + .05
        self.history = {"i2c0": (0, 0)}
        self.stale = {}
        self.out.append([self.boot_at + .3, b"ESP-ROM:esp32p4-eco2-20240710\r\nI (25) boot: ESP-IDF v5.4.2 2nd stage bootloader\r\n"])
        self.last_due = self.boot_at + .3

    def _worlds(self):
        worlds = []
        for name, file in device.NATIVE.items():
            error = self.each_boot.get(name) or self.stale.get(name) or ""
            worlds.append({"name": name, "kind": "app", "engine": "native", "state":
                           "restarting" if self.up < self.settle_s else "idle", "turns": int(self.up * 10),
                           "msgs": int(self.up * 10), "cpu_ms": round(self.up * 2.5, 3), "mbox": 0, "mbox_peak": 3,
                           "restarts": 1 if error else 0, "budget_ms": 80, "last_error": error, "file": file})
        worlds.append({"name": "launcher", "kind": "app", "engine": "js", "state": "idle", "restarts": 0,
                       "last_error": "", "file": "apps/launcher.js"})
        return worlds

    def _bus(self, name):
        transfers, errors = self.history.get(name, (0, 0))
        if name == "i2c0":
            transfers += int(self.i2c_rate * self.up)
            errors += int(self.i2c_error_rate * self.up)
        else:
            transfers += int(self.spi_rate * self.up)
        return transfers, errors

    def _stats(self):
        lines = [f"t = {self.up * 1000:.1f} ms, lane busy 1234.5 ms (1.0%), 4567 turns, 890 published, 880 delivered, 0 crashes"]
        for name in ("i2c0", "spi2"):
            transfers, errors = self._bus(name)
            lines.append(f"  bus {name:<5} busy {transfers * .5:8.2f} ms, {transfers} transfers, {transfers * 4} bytes, {errors} errors")
        return "\n".join(lines) + "\n"

    def _painter(self):
        ready = self.up >= self.painter_after_s
        calls = int((self.up - self.painter_after_s) * 5) + 1 if ready and self.display_on else 0
        p = {"sources": 1 if ready else 0, "compiles": 1 if ready else 0, "installed": ready, "packets": 3 if ready else 0,
             "calls": calls, "paints": calls, "rejects": 0, "compile_us": 5680000 if ready else 0, "relocate_us": 900,
             "native_us": 0, "raster_us": 0, "image_bytes": 20000 if ready else 0}
        self.painter_answers.append(p)
        return p
