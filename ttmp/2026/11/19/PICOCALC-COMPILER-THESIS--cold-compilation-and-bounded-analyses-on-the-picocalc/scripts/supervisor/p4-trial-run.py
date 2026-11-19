"""Qualify four Editor pipelines on a single PicoCalc and restore its saved factory image."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import statistics
import subprocess
import sys

ticket = Path(__file__).resolve().parents[2]
root = Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip())
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("work", type=Path)
parser.add_argument("port")
parser.add_argument("esptool", type=Path)
a = parser.parse_args()
work, port = a.work.resolve(), a.port
original = work / "original/factory-original.bin"
build = work / "build"
app = build / "picocalc-os-p4.bin"
reference = json.loads((ticket / "various/supervisor/fresh-factorial-editor.json").read_text())
oracle = json.loads(subprocess.check_output(["node",Path(__file__).with_name("p4-bundle-oracle.mjs"),work],text=True))
onboard = (work / "original/partition-table.bin").read_bytes()
table = (build / "partition_table/partition-table.bin").read_bytes()
assert len(onboard) == 4096 and table.ljust(4096, b"\xff") == onboard
assert original.stat().st_size == 8 * 1024**2 and 0 < app.stat().st_size < original.stat().st_size

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

assert oracle["source_sha256"] == reference["source_sha256"]

def capture(name, seconds, commands):
    command = [sys.executable, root / "picocalc-os/tools/p4cap.py", "--no-reset", "-p", port, "-s", str(seconds)]
    for cmd in commands:
        command += ["-c", cmd]
    log = work / (name + ".log")
    with log.open("wb") as output:
        subprocess.run(command, stdout=output, check=True)
    return log.read_text(errors="replace")

def hold(label):
    result = capture(label + "-hold", 2, ["0.25 hold"])
    if "i2c0 held between transactions" not in result or "#OK hold" not in result:
        raise RuntimeError(f"{label}: no bus hold acknowledgement")

def flash(label, image):
    with (work / (label + "-flash.log")).open("wb") as output:
        subprocess.run([a.esptool,"--chip","esp32p4","-p",port,"-b","921600",
                        "write_flash","0x10000",image],stdout=output,stderr=subprocess.STDOUT,check=True)
    if "Hash of data verified" not in (work / (label + "-flash.log")).read_text(errors="replace"):
        raise ValueError("esptool did not verify the application")

def parse(log):
    rx = r"^(original|register|packed|stream) compile source=bundle status=ok us=(\d+) peak_js_bytes=(\d+) module_bytes=(\d+)$"
    timings = re.findall(rx, log, re.M)
    hashes = re.findall(r"^thesis digest (\d+) (\d+) (\w+) ([a-f0-9]{64})$",log,re.M)
    if len(timings) != 16 or len(hashes) != 16 or "thesis trials complete" not in log:
        raise ValueError(f"incomplete series: {len(timings)} timings, {len(hashes)} digests")
    rows = {}
    for i, ((lane, us, peak, size),(block, pos, named, digest)) in enumerate(zip(timings, hashes)):
        expected = oracle["results"][lane]
        assert named == lane and digest == expected and int(size) == 240452
        assert (int(block), int(pos)) == divmod(i, 4)
        rows.setdefault(lane,[]).append({"block":int(block), "position":int(pos), "us":int(us),
                                        "peak_js_bytes":int(peak),"module_bytes":int(size),"sha256":digest})
    for values in rows.values():
        assert sorted(r["position"] for r in values) == list(range(4))
    return rows

def worlds_ok(log):
    for line in log.splitlines():
        if line.startswith('[{"name":'):
            apps = json.loads(line)
            return any(v["name"] == "editor" and v["engine"] == "native" and
                       v["file"] == "editor/compiled.bin" and not v["last_error"] for v in apps)
    return False

receipt = {"source_sha256":oracle["source_sha256"], "reactor_sha256":oracle["reactor_sha256"],
           "host_module_sha256_on_firmware_reactor":oracle["results"],
           "trial_firmware_sha256":sha(app),"original_partition_sha256":sha(original),
           "partition_table_sha256":sha(build / "partition_table/partition-table.bin")}
hold("before-test")
try:
    flash("experiment", app)
    log = capture("first-boot", 68, ["64 worlds"])
    try:
        lanes = parse(log)
    except ValueError:
        if not worlds_ok(log):
            raise
        log = capture("full-boot", 70, ["0.4 reboot","67 worlds"])
        lanes = parse(log)
    assert worlds_ok(log)
    receipt["lanes"] = lanes
    receipt["medians"] = {k: {m:statistics.median(row[m] for row in v) for m in ("us","peak_js_bytes")} for k,v in lanes.items()}
    print(json.dumps(receipt["medians"]), flush=True)
    (work / "trial-results.json").write_text(json.dumps(receipt, indent=2)+"\n")
    checker, = (ticket.parent).glob("PICOCALC-EDITOR-CAPACITY--*/scripts/03-check-large-preview-on-p4.py")
    subprocess.run([sys.executable,checker,"--engine","native","--port",port,
                    "--output",work/"preview","--long-inline"],check=True)
    receipt["replay"] = json.loads((work / "preview/results.json").read_text())
finally:
    # The hardware hold protects the shared keyboard bus before the flasher resets the MCU.
    hold("before-restore")
    flash("restore", original)
    restored = capture("restore-worlds", 14, ["11 worlds"])
    assert worlds_ok(restored), "restored image failed to boot the original Editor"
    receipt["original_restored_and_editor_running"] = True
    (work / "trial-results.json").write_text(json.dumps(receipt, indent=2)+"\n")
