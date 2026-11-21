import fcntl
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import time

HERE = Path(__file__).resolve().parent
DAY = HERE.parents[2]
SNAKE = (
    next(DAY.glob("PICOCALC-SNAKE-INTEGRATION--*"))
    / "scripts/device/01-normal-snake.py"
)
spec = importlib.util.spec_from_file_location("pico_console", SNAKE)
unit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(unit)
ESP = "/home/manuel/.espressif/python_env/idf5.4_py3.11_env/bin/esptool.py"
APP = "picocalc-os-p4.bin"
PART = "partition_table/partition-table.bin"
RELEASE = Path("/tmp/chess-camera-release/build")
RELEASE_SHA = "134f3a249589a860a1a85311e361498a9e6ba4f14bef34ca2397ea26ca86ebc1"
PART_SHA = "72721dc3ce2597504dc568023e778100401a308455fea40d174d282386571d30"
APP_NAMES = {"agenda", "files", "editor", "chess", "mobile-painter"}
COMPILE = re.compile(
    r"^(\S+) compile source=(\S+) status=(\S+) us=(\d+) peak_js_bytes=(\d+) module_bytes=(\d+)"
)


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def save(path, js):
    path.write_text(json.dumps(js, indent=2) + "\n")


def esp(op, image, out, tag, port):
    a = [
        ESP,
        "--chip",
        "esp32p4",
        "-p",
        port,
        "-b",
        "921600",
        "--after",
        "hard_reset" if op == "verify_flash" else "no_reset",
        op,
        "0x10000",
        str(image / APP),
    ]
    if op == "verify_flash":
        a += ["0x8000", str(image / PART)]
    with (out / (tag + ".log")).open("wb") as f:
        subprocess.run(a, stdout=f, stderr=subprocess.STDOUT, check=True, timeout=210)


def hold(c):
    try:
        assert any(
            "held between transactions" in line
            for line in c.command("hold", timeout=16)
        )
    finally:
        c.close()


def painter(c):
    return next(
        json.loads(line)
        for line in c.command("painter")
        if line.startswith('{"sources"')
    )


def ready(c):
    worlds = c.health()
    deadline = time.monotonic() + 20
    while True:
        p = painter(c)
        if p["installed"] and p["calls"] and not p["rejects"]:
            return worlds, p
        if time.monotonic() >= deadline:
            raise RuntimeError("painter " + str(p))
        time.sleep(0.15)


def cold(c):
    c.send("reboot")
    start = time.monotonic()
    deadline = start + 45
    seen = {}
    log = []
    while set(seen) != APP_NAMES:
        s = c.line(deadline).decode(errors="replace")
        m = COMPILE.match(s)
        if m:
            app, source, status, us, peak, size = m.groups()
            assert status == "ok" and app in APP_NAMES and app not in seen, s
            seen[app] = {
                "source": source,
                "us": int(us),
                "peakJSBytes": int(peak),
                "moduleBytes": int(size),
            }
        if any(("] " + name + " crashed") in s for name in unit.NATIVE):
            log.append(s)
    compiler_end = time.monotonic()
    worlds, p = ready(c)
    assert not log and p["compiles"] == 1 and p["rejects"] == 0
    return {
        "apps": seen,
        "rebootToLastCompilerLineMs": round(1000 * (compiler_end - start), 2),
        "rebootToPolledHealthyMs": round(1000 * (time.monotonic() - start), 2),
        "painter": p,
        "nativeWorlds": sorted(set(worlds) & unit.NATIVE.keys()),
    }


def acquire():
    f = unit.LOCK.open("a")
    fcntl.flock(f, fcntl.LOCK_EX)
    return f
