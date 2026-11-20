"""Qualify three quiescent Chess frames and restore the attested release on failure."""
import argparse
import fcntl
import hashlib
import importlib.util
import json
import signal
import struct
import subprocess
import time
from pathlib import Path

D = Path(__file__).resolve()
snake = next(D.parents[3].glob("PICOCALC-SNAKE-INTEGRATION--*/scripts/device/01-normal-snake.py"))
spec = importlib.util.spec_from_file_location("snake_console", snake)
shared = importlib.util.module_from_spec(spec)
spec.loader.exec_module(shared)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(args):
    args.output.mkdir(parents=True, exist_ok=False)
    app = Path("picocalc-os-p4.bin")
    partition = Path("partition_table/partition-table.bin")
    if sha(args.release / app) != "c3d5d8ede739f5d4d21ad2b4981fbfd839cf20e2ab2a644ba1d330e6374446e3":
        raise ValueError("unexpected recovery firmware")
    image = args.image or args.release
    if (image / partition).read_bytes() != (args.release / partition).read_bytes() or (image / app).stat().st_size >= 0x800000:
        raise ValueError("image geometry differs from the known release")

    def esp(verb, build, tag):
        cmd = [str(args.esptool), "--chip", "esp32p4", "-p", args.port, "-b", "921600", verb, "0x10000", str(build / app)]
        if verb == "verify_flash":
            cmd += ["0x8000", str(build / partition)]
        with (args.output / (tag + ".log")).open("wb") as log:
            subprocess.run(cmd, check=True, timeout=180, stdout=log, stderr=subprocess.STDOUT)

    shared.OBSERVED = {"chess", "keyboard", "compositor", "display"}
    result = {"firmware":sha(image / app), "partitionTable":sha(image / partition), "memoryKeys":args.memory_keys,
              "screens":{}, "windows":{}, "verified":False}
    def save():
        (args.output / "receipt.json").write_text(json.dumps(result, indent=2) + "\n")

    with shared.LOCK.open("a") as guard, (args.output / "uart.log").open("wb", buffering=0) as log:
        fcntl.flock(guard, fcntl.LOCK_EX)
        def console():
            return shared.Console(args.port, log)
        c = console()
        attempted = False
        qualified = False
        try:
            def hold():
                if not any("held between transactions" in s for s in c.command("hold", timeout=16)):
                    raise RuntimeError("driver hold failed")
                c.close()
            hold()
            esp("verify_flash", args.release, "release-verified")
            if args.image:
                c = console()
                hold()
                attempted = True
                esp("write_flash", image, "temporary-write")
                esp("verify_flash", image, "candidate-verified")
            result["verified"] = True
            c = console()
            result["boot"] = c.counters()
            save()
            if args.boot_check:
                deadline = time.monotonic() + 12
                while True:
                    status = next(json.loads(l) for l in c.command("painter") if l.startswith('{"sources"'))
                    if status["installed"] or status["rejects"] or time.monotonic() >= deadline:
                        break
                    time.sleep(.15)
                result["bootPainter"] = status
                if not status["installed"] or status["compiles"] != 1 or status["rejects"] or status["calls"] <= 0:
                    raise ValueError(f"unhealthy ordinary native painter: {status}")
                try:
                    c.input_ready()
                    result["keyboard"] = "controller responded"
                except ValueError as exc:
                    result["keyboard"] = str(exc)
                qualified = True
                return
            if args.memory_keys:
                command = "snakeobs memory-keys" if args.memory_keys == "snake" else "panelobs memory-keys"
                lines = c.command(command)
                if not any("memory keys" in l for l in lines):
                    raise ValueError("substitute not active")
            else:
                c.input_ready()
            if args.spi:
                if "panel capture active" not in c.command("panelobs start"):
                    raise RuntimeError("panel capture unavailable")
            if args.mobile:
                result["bootPainter"] = next(json.loads(l) for l in c.command("painter") if l.startswith('{"sources"'))
            c.command("key f1")
            time.sleep(2)
            for label, key in (("e2","h"),("e3","up"),("f3","right")):
                before = c.counters()
                begin = time.monotonic()
                c.command("key " + key)
                time.sleep(1)
                after = c.counters()
                delta = {k:round(v-before["spi2"][k],3) for k,v in after["spi2"].items()}
                result["windows"][label] = {"before":before, "after":after, "spi2":delta,
                                            "hostWindowMs":round((time.monotonic()-begin)*1000,2)}
                if not delta["bytes"] or delta["errors"] or any(after[k]["restarts"] != before[k]["restarts"] for k in shared.OBSERVED):
                    raise ValueError(f"{label} invalid SPI2 or compositor health: {delta}")
                screen = c.shot(label, args.output)
                result["screens"][label] = screen
                pixels = (args.output / (label + ".rgb565")).read_bytes()
                red = 0xe800 | ((0x49 >> 2) << 5) | (0x2d >> 3)
                points = [(i%320,i//320) for i,(color,) in enumerate(struct.iter_unpack("<H",pixels)) if color == red and 22 <= i//320 < 290]
                if len(points) != 92:
                    raise ValueError(f"{label} cursor outline has {len(points)} red pixels")
                screen["cursor"] = [min(x for x,y in points),min(y for x,y in points),max(x for x,y in points),max(y for x,y in points)]
                if args.control:
                    baseline = (args.control / (label + ".rgb565")).read_bytes()
                    if pixels[22*640:] != baseline[22*640:]:
                        raise ValueError(f"{label}: Chess content or hints differs from physical control")
                if args.spi:
                    lines = c.command("panelobs check")
                    result["screens"][label]["panel"] = next(json.loads(l) for l in lines if l.startswith('{"panel'))
                    panel = screen["panel"]
                    if panel["faults"] or panel["remaining"] or not panel["windows"]:
                        raise ValueError(f"{label}: incomplete SPI history: {panel}")
                    if panel["panelCRC"] != f"{shared.zlib.crc32(pixels[22*640:]):08x}":
                        raise ValueError(f"{label}: completed SPI pixels differ")
                if args.mobile:
                    status = next(json.loads(l) for l in c.command("painter") if l.startswith('{"sources"'))
                    screen["painter"] = status
                    prior = result["screens"][{"e3":"e2","f3":"e3"}[label]]["painter"] if label != "e2" else None
                    if (not status["installed"] or status["compiles"] != 1 or status["rejects"] or not status["paints"]
                            or (prior and any(status[k] <= prior[k] for k in ("packets","calls","paints")))):
                        raise ValueError(f"{label}: mobile painter failed to install or reuse: {status}")
                save()
            coords = [result["screens"][label]["cursor"][:2] for label in ("e2","e3","f3")]
            (x,y),b,d = coords
            if b != [x,y-26] or d != [x+26,y-26]:
                raise ValueError(f"cursor did not move through e2, e3 and f3: {coords}")
            if args.mobile:
                previous = result["screens"]["f3"]["painter"]
                c.command("restart compositor")
                time.sleep(2.2)
                c.health()
                c.command("key h")
                time.sleep(1)
                shot = c.shot("after-reopen", args.output)
                status = next(json.loads(l) for l in c.command("painter") if l.startswith('{"sources"'))
                result["reopen"] = {"screen":shot,"painter":status}
                if (shot["appSha256"] != result["screens"]["f3"]["appSha256"] or
                        status["compiles"] != 1 or status["paints"] <= previous["paints"]):
                    raise ValueError(f"compositor restart lost active Chess state: {result['reopen']}")
                if args.spi:
                    panel = next(json.loads(l) for l in c.command("panelobs check") if l.startswith('{"panel'))
                    result["reopen"]["panel"] = panel
                    if panel["faults"] or panel["remaining"] or panel["panelCRC"] != result["screens"]["f3"]["panel"]["panelCRC"]:
                        raise ValueError(f"compositor reentry SPI mismatch: {panel}")
            c.command("key f1")
            qualified = True
        except BaseException as e:
            result["failure"] = repr(e)
            raise
        finally:
            if attempted and (not qualified or not args.install):
                try:
                    c.command("hold",timeout=10)
                except Exception:
                    pass
                c.close()
                esp("write_flash", args.release, "restore")
                esp("verify_flash", args.release, "restore-verified")
                c = console()
                result["restored"] = c.counters()
            c.close()
            save()


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("output",type=Path)
    p.add_argument("--port", default="/dev/ttyACM0")
    p.add_argument("--release",type=Path,default=Path("/tmp/pico-snake-production/build"))
    p.add_argument("--image",type=Path)
    p.add_argument("--memory-keys",choices=("snake","panel"))
    p.add_argument("--control",type=Path)
    p.add_argument("--mobile",action="store_true")
    p.add_argument("--spi",action="store_true")
    p.add_argument("--install",action="store_true")
    p.add_argument("--boot-check",action="store_true",help="ordinary release boot and install, after matched observed acceptance")
    p.add_argument("--accepted",type=Path,help="successful observed receipt with completed SPI and native reuse")
    p.add_argument("--esptool",type=Path,default=Path("/home/manuel/.espressif/python_env/idf5.4_py3.11_env/bin/esptool.py"))
    args = p.parse_args()
    if args.boot_check:
        if not args.install or not args.mobile or args.spi or args.memory_keys or not args.image or not args.accepted:
            p.error("ordinary release check requires --install --mobile --image --accepted")
        evidence = json.loads(args.accepted.read_text())
        if ("failure" in evidence or not evidence.get("verified") or not evidence.get("restored")
                or set(evidence["screens"]) != {"e2","e3","f3"}
                or any(not f["painter"]["installed"] or f["painter"]["compiles"] != 1
                       or f["painter"]["rejects"] or f["panel"]["faults"] for f in evidence["screens"].values())):
            p.error("incomplete observed acceptance")
    if args.install and (args.memory_keys or args.spi or not (args.control or args.boot_check)):
        p.error("install requires a control and the ordinary firmware")
    def interrupted(*_):
        raise KeyboardInterrupt()
    signal.signal(signal.SIGTERM, interrupted)
    run(args)
