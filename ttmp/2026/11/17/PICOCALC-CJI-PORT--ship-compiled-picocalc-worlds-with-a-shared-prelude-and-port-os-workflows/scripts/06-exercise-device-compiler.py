"""Acceptance for a development PicoCalc with the compiler firmware.

Run from repo root after 04-observe-compiler.py has built the original toplog.
Uses apps/cjiprobe.js, apps/0-cjicheck.js and the operator's dev-cji slot.
"""
import argparse
import base64
import hashlib
from pathlib import Path
import re
import time

import serial

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--port", default="/dev/serial/by-id/usb-1a86_USB_Single_Serial_5B61091051-if00")
args = parser.parse_args()
scripts = Path(__file__).resolve().parent
source_dir = next(Path("ttmp/2026/11/17").glob("PICOCALC-CJI--*/sources/cji"))
original = (source_dir / "tests/native/toplog.world.js").read_bytes()
reference = Path("picocalc-os/port/esp32p4/build-elf/esp-idf/main/natives/toplog.elf").read_bytes()
reference_hash = hashlib.sha256(reference).hexdigest()
port = serial.Serial(args.port, 115200, timeout=.15)
probe = "apps/cjiprobe.js"

def send(command):
    port.write(b"\n" + command.encode() + b"\n")

def until(pattern, timeout=90):
    end = time.monotonic() + timeout
    regex = re.compile(pattern)
    while time.monotonic() < end:
        line = port.readline().decode(errors="replace").strip()
        if line.startswith("[{") or "agent.state from" in line:
            continue
        if "Guru Meditation" in line or "assert failed:" in line:
            raise RuntimeError(line)
        if line.startswith("cji:") or regex.search(line):
            print(line, flush=True)
        if regex.search(line):
            return line
    raise TimeoutError(pattern)

def command(cmd):
    send(cmd)
    until("^#OK " + cmd.split()[0] + "$", 6)

def put(name, data):
    command("put " + name)
    for i in range(0, len(data), 640):
        payload = base64.b64encode(data[i:i + 640]).decode()
        send("put " + name + " " + payload)
        until("^put " + re.escape(name) + ": " + str(min(i + 640, len(data))) + " bytes$", 8)
        until("^#OK put$", 4)

def key(name):
    command("key " + name)
    time.sleep(.45)

def loader_select(filename):
    send("ls apps")
    names = []
    until_deadline = time.monotonic() + 5
    while time.monotonic() < until_deadline:
        line = port.readline().decode(errors="replace").strip()
        if line == "#OK ls":
            break
        match = re.fullmatch(r"([a-z0-9-]{1,12}\.(?:js|wasm))\s+[0-9]+", line)
        if match:
            names.append(match.group(1))
    position = sorted(names).index(filename)
    key("f1")
    key("u")
    time.sleep(.5)
    for _ in range(len(names)):
        key("up")
    for _ in range(position):
        key("down")

def caller():
    loader_select("0-cjicheck.js")
    key("enter")

def installed_slot():
    # At this checkpoint exactly one slot contains the original toplog image.
    send("ls cjidev")
    slots = []
    end = time.monotonic() + 5
    while time.monotonic() < end:
        line = port.readline().decode(errors="replace").strip()
        if line == "#OK ls":
            break
        match = re.fullmatch(r"([ab])\.elf\s+([0-9]+)", line)
        if match and int(match.group(2)) == len(reference):
            slots.append(match.group(1))
    if len(slots) != 1:
        raise RuntimeError(f"cannot uniquely identify the test slot: {slots}")
    return slots[0]

def build(mode, expectation):
    send("cji " + mode + " " + probe)
    until(expectation)

try:
    # First case identifies both the producer's bytes and the consumer's origin.
    put(probe, original)
    send("cji build " + probe)
    until("artifact .*sha256=" + reference_hash)
    until("ready dev-cji engine=native")
    put("apps/0-cjicheck.js", (scripts / "05-ping-development-world.js").read_bytes())
    caller()
    until(r"CJI-CHECK reply pong$", 12)
    key("f1")
    # Two short lines make the cursor positions independent of wrapping.
    put(probe, b'service("x").on("ping", () =>\n"pong");\n')
    loader_select("cjiprobe.js")
    key("f3")
    time.sleep(.8)
    # Editor restores the previous cursor for this file across boots.
    for _ in range(4):
        key("up")
    key("home")
    key("down")
    key("home")
    for _ in range(5):
        key("right")
    command("type -two")
    time.sleep(.8)
    key("f2")
    time.sleep(.8)
    send("cat " + probe)
    until(r'^"pong-two"\);$', 5)
    key("f1")
    build("build", "ready dev-cji engine=native cache=miss")
    until(r"CJI-CHECK reply pong-two$", 10)

    put(probe, b"const broken = ;\n")
    build("build", "cji: build failed:")
    until(r"CJI-CHECK reply pong-two$", 10)
    put(probe, b'throw new Error("intentional candidate boot failure");\n')
    build("build", "cji: candidate failed during boot")
    until(r"CJI-CHECK reply pong-two$", 10)
    fallback = b'const p = new Proxy({msg:"fallback-pong"}, {}); service("dev").on("ping", () => p.msg);\n'
    put(probe, fallback)
    build("install", "ready dev-cji engine=js cache=miss")
    until(r"CJI-CHECK reply fallback-pong$", 10)

    put(probe, original)
    build("install", "ready dev-cji engine=native cache=miss")
    until(r"CJI-CHECK reply pong$", 10)
    send("reboot")
    until("ready dev-cji engine=native cache=hit", 35)
    caller()
    until(r"CJI-CHECK reply pong$", 12)
    key("f1")
    # Only mutate the disposable installer slots created by this test.
    put("cjidev/" + installed_slot() + ".elf", b"invalid test artifact")
    send("reboot")
    until("cji: compiling source on device", 20)
    until("artifact .*sha256=" + reference_hash)
    until("ready dev-cji engine=native cache=miss")
    put("cjidev/" + installed_slot() + ".js", b"log('unapproved source');")
    send("reboot")
    until("cji: installed source missing or changed", 20)
    time.sleep(6)
    send("cji install " + probe)
    until("cji: compiling source on device")
    send("cji build " + probe)
    until("cji: busy", 5)
    until("artifact .*sha256=" + reference_hash)
    until("ready dev-cji engine=native cache=miss")
    send("reboot")
    until("ready dev-cji engine=native cache=hit", 35)
    caller()
    until(r"CJI-CHECK reply pong$", 12)
    key("f1")
    loader_select("0-cjicheck.js")
    key("f2")
    key("f1")
    print("PASS native parity, Editor, rollback, fallback, verified reboot, artifact repair, source refusal and authorized reinstall")
finally:
    port.close()
