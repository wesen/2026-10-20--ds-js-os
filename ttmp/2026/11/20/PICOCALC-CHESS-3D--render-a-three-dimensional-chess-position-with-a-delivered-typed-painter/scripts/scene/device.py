"""Exercise the real 3D scene, verify completed SPI pixels, and restore the ordinary app."""
import argparse
import fcntl
import importlib.util
import json
from pathlib import Path
import re
import signal
import subprocess
import time
import zlib

BASE = Path(__file__).resolve().parents[3]
module = next(BASE.glob("PICOCALC-SNAKE-INTEGRATION--*/scripts/device/01-normal-snake.py"))
spec = importlib.util.spec_from_file_location("device_console", module)
serial = importlib.util.module_from_spec(spec)
spec.loader.exec_module(serial)

RELEASE_SHA = "75c94df7b1aa565c8cb7858bea628aa2c9c644ef64cc885b96e1d80088f8af56"
PART_SHA = "72721dc3ce2597504dc568023e778100401a308455fea40d174d282386571d30"
APP = Path("picocalc-os-p4.bin")
PARTITION = Path("partition_table/partition-table.bin")
BODY_TOP = 22 * 320 * 2
HINT_TOP = 302 * 320 * 2
KEYS = (("e2", "h"), ("e3", "up"), ("f3", "right"))


def fnv(payload):
    value = 2166136261
    for byte in payload:
        value = ((value ^ byte) * 16777619) & 0xffffffff
    return f"{value:08x}"


def status(console, command, prefix):
    return next(json.loads(line) for line in console.command(command) if line.startswith(prefix))


def painter(console):
    return status(console, "painter", '{"sources"')


def hold(console):
    if not any("held between transactions" in line for line in console.command("hold", timeout=16)):
        raise RuntimeError("driver hold failed")
    console.close()


def esp(args, verb, build, tag):
    after = "no_reset" if verb == "write_flash" else "hard_reset"
    cmd = [str(args.esptool), "--chip", "esp32p4", "-p", args.port, "-b", "921600",
           "--after", after, verb, "0x10000", str(build / APP)]
    if verb == "verify_flash":
        cmd += ["0x8000", str(build / PARTITION)]
    with (args.output / (tag + ".log")).open("wb") as log:
        subprocess.run(cmd, check=True, timeout=180, stdout=log, stderr=subprocess.STDOUT)


def run(args):
    release = (args.release / APP).read_bytes()
    partition = (args.release / PARTITION).read_bytes()
    candidate = (args.image / APP).read_bytes()
    if serial.digest(release) != RELEASE_SHA or serial.digest(partition) != PART_SHA:
        raise ValueError("unexpected release identity")
    if (args.image / PARTITION).read_bytes() != partition or len(candidate) >= 0x800000:
        raise ValueError("candidate layout differs from the release")
    expected = {name:(args.reference / (name + ".rgb565")).read_bytes() for name, _ in KEYS}
    source, linked = args.source.read_bytes(), args.linked.read_bytes()
    if any(len(frame) != 298 * 640 for frame in expected.values()):
        raise ValueError("reference must contain the full app body and hint strip")
    result = {"firmware":serial.digest(candidate), "partition":PART_SHA,
              "release":RELEASE_SHA, "input":"instrumented keyboard register", "screens":{}}
    serial.OBSERVED = {"chess", "keyboard", "compositor", "display"}
    args.output.mkdir(parents=True, exist_ok=False)
    uart = args.output / "uart.log"

    def save():
        (args.output / "receipt.json").write_text(json.dumps(result, indent=2) + "\n")

    with serial.LOCK.open("a") as guard, uart.open("wb", buffering=0) as log:
        fcntl.flock(guard, fcntl.LOCK_EX)

        def connect():
            return serial.Console(args.port, log)

        c = connect()
        attempted = False
        try:
            hold(c)
            esp(args, "verify_flash", args.release, "release-verified")
            result["releasePreflight"] = True
            save()
            c = connect()
            hold(c)
            attempted = True
            esp(args, "write_flash", args.image, "temporary-write")
            esp(args, "verify_flash", args.image, "candidate-verified")
            result["candidateVerified"] = True
            save()

            c = connect()
            c.health()
            if not any("memory keys" in line for line in c.command("panelobs memory-keys")):
                raise RuntimeError("isolated keyboard register unavailable")
            if "panel capture active" not in c.command("panelobs start"):
                raise RuntimeError("SPI completion capture unavailable")
            result["bootPainter"] = painter(c)
            c.command("key f1")
            time.sleep(2)
            previous = None
            for name, key in KEYS:
                before = c.counters()
                begin = time.monotonic()
                c.command("key " + key)
                time.sleep(1)
                after = c.counters()
                spi = {k:round(v - before["spi2"][k], 3) for k, v in after["spi2"].items()}
                if not spi["bytes"] or spi["errors"] or any(after[k]["restarts"] != before[k]["restarts"] for k in serial.OBSERVED):
                    raise ValueError(f"{name} invalid SPI or world health")
                window_ms = round((time.monotonic() - begin) * 1000, 2)
                shot = c.shot(name, args.output)
                pixels = (args.output / (name + ".rgb565")).read_bytes()
                panel = status(c, "panelobs check", '{"panel')
                native = painter(c)
                shot.update(panel=panel, painter=native, spi2=spi, hostWindowMs=window_ms,
                            worldDelta={world:{key:round(after[world][key] - before[world][key], 3)
                                               for key in ("turns", "cpu_ms", "restarts")}
                                        for world in sorted(serial.OBSERVED)},
                            bodySha256=serial.digest(pixels[BODY_TOP:HINT_TOP]),
                            hintSha256=serial.digest(pixels[HINT_TOP:]))
                result["screens"][name] = shot
                save()
                if panel["faults"] or panel["remaining"] or not panel["windows"] or panel["panelCRC"] != f"{zlib.crc32(pixels[BODY_TOP:]):08x}":
                    raise ValueError(f"{name} completed SPI differs from the framebuffer: {panel}")
                if pixels[BODY_TOP:] != expected[name]:
                    differences = [sum(a != b for a, b in zip(actual, reference)) for actual, reference in
                                   ((pixels[BODY_TOP:HINT_TOP], expected[name][:HINT_TOP-BODY_TOP]),
                                    (pixels[HINT_TOP:], expected[name][HINT_TOP-BODY_TOP:]))]
                    raise ValueError(f"{name} framebuffer unequal to independent reference, differing body/hint bytes {differences}")
                if (not native["installed"] or native["compiles"] != 1 or not native["sources"]
                        or not native["calls"] or not native["paints"] or native["rejects"]
                        or (previous and any(native[k] <= previous[k] for k in ("packets", "calls", "paints")))):
                    raise ValueError(f"{name} source failed to install or reuse: {native}")
                previous = native
            lines = re.findall(rb"chess3d-target=pie source-bytes=(\d+) source-fnv=([0-9a-f]{8}) linked-bytes=(\d+) linked-fnv=([0-9a-f]{8})", uart.read_bytes())
            expected_identity = tuple(v.encode() for v in (str(len(source)), fnv(source), str(len(linked)), fnv(linked)))
            result["compiled"] = {"match":lines == [expected_identity], "sourceSha256":serial.digest(source),
                                  "linkedScalarHostSha256":serial.digest(linked),
                                  "uartFields":[[v.decode() for v in line] for line in lines]}
            save()
            if not result["compiled"]["match"]:
                raise ValueError("delivered source or P4-linked image differs from stock host identity")
            result["qualified"] = True
            c.command("key f1")
        except BaseException as exc:
            result["failure"] = repr(exc)
            raise
        finally:
            if attempted:
                try:
                    if c.port.is_open:
                        hold(c)
                except Exception as exc:
                    result["restoreHold"] = repr(exc)
                c.close()
                try:
                    esp(args, "write_flash", args.release, "restore")
                    esp(args, "verify_flash", args.release, "restore-verified")
                    result["restoreReadback"] = True
                    save()
                    c = connect()
                    result["restoredWorlds"] = sorted(w for w in c.health() if w in serial.NATIVE)
                    result["restoredPainter"] = painter(c)
                    if not result["restoredPainter"]["installed"] or result["restoredPainter"]["rejects"]:
                        raise RuntimeError("restored ordinary painter failed to install")
                finally:
                    save()
            c.close()
            save()


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    for name in ("output", "release", "image", "reference", "source", "linked"):
        p.add_argument(name, type=Path)
    p.add_argument("--port", default="/dev/ttyACM0")
    p.add_argument("--esptool", type=Path, default=Path("/home/manuel/.espressif/python_env/idf5.4_py3.11_env/bin/esptool.py"))
    def interrupted(*_):
        raise KeyboardInterrupt()
    signal.signal(signal.SIGTERM, interrupted)
    run(p.parse_args())
