#!/usr/bin/env python3
"""Compare five representations through the Linux build of the P4 Editor entry."""
import argparse
from collections import Counter
import hashlib
import io
import json
from pathlib import Path
import platform
import random
import re
from statistics import median
import subprocess
import sys
import tarfile
from tempfile import TemporaryDirectory

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "representation"))
from variants import frontend, native

ROOT = next(p for p in HERE.parents if (p / ".git").exists())
REV = "f0846ba"
LANES = ["production", "pruned", "unframed", "packed", "stream"]


def git(*args):
    return subprocess.check_output(["git", "-C", ROOT, *args])


def sha(data):
    return hashlib.sha256(data).hexdigest()


def build(work, gcc, rev):
    paths = ["compiler", "sdk", "worlds/editor", "third_party/quickjs", "nucleus/nucleus.h"]
    paths += ["port/esp32p4/main/" + f for f in ("typed_p4.c", "editor_p4.c", "p4.h")]
    archive = git("archive", rev, *["picocalc-os/" + p for p in paths])
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        tar.extractall(work, filter="data")
    osdir = work / "picocalc-os"
    engine = osdir / "third_party/quickjs"
    sdk = osdir / "sdk"
    p4 = osdir / "port/esp32p4/main"
    header = work / "freertos"
    header.mkdir()
    (header / "FreeRTOS.h").touch()
    (header / "queue.h").write_text("typedef void *QueueHandle_t;\n")
    shim = HERE.parent / "supervisor/cold-entry.c"
    version = (engine / "VERSION").read_text().strip()
    flags = ["-O2", "-std=gnu11", "-D_GNU_SOURCE", f'-DCONFIG_VERSION="{version}"',
             "-DPICOCALC_TYPED_EDITOR=1", "-DPICOCALC_RV32_EDITOR=1"]
    subprocess.run(["cc", *flags, "-I", work, "-I", osdir/"nucleus", "-I", p4, "-I", engine,
        shim, p4/"typed_p4.c", p4/"editor_p4.c",
        *(engine/f for f in ("quickjs.c", "libregexp.c", "libunicode.c", "cutils.c", "dtoa.c")),
        "-lm", "-lpthread", "-o", work/"compile"], check=True)
    gccflags = ["-march=rv32imafc_zicsr_zifencei", "-mabi=ilp32f", "-Os", "-fPIC", "-shared",
        "-nostartfiles", "-nostdlib", "-e", "app_main", "-ffunction-sections", "-fdata-sections",
        "-Wl,--gc-sections", "-fvisibility=hidden", "-Wl,--strip-all", "-Wl,-z,max-page-size=16",
        "-Wno-attributes"]
    subprocess.run([gcc, *gccflags, "-I", sdk, "-o", work/"reactor", sdk/"typed/world.c",
        sdk/"typed/rv32-slot.S", sdk/"nw_elf.c", engine/"libunicode.c"], check=True)
    return {"cc": subprocess.check_output(["cc", "--version"], text=True).splitlines()[0],
        "gcc": subprocess.check_output([gcc, "--version"], text=True).splitlines()[0],
        "ccFlags": flags, "targetFlags": gccflags, "archiveSha256": sha(archive),
        "shimSha256": sha(shim.read_bytes()), "quickjsVersion": version,
        "generatorSha256": sha((HERE.parent/"representation/variants.py").read_bytes())}


def prepare(work):
    osdir = work / "picocalc-os"
    compiler = osdir / "compiler"
    app = osdir / "worlds/editor"
    source = b"".join((app/f).read_bytes() + b"\n" for f in (app/"source.list").read_text().splitlines())
    wasm = (compiler/"typed-wasm.js").read_text()
    rv32 = (compiler/"typed-rv32.js").read_text()
    world = (compiler/"typed-world.js").read_bytes()
    reactor = (work/"reactor").read_bytes()
    results = {}
    for label in LANES:
        lane = "bytes" if label in ("production", "pruned") else label
        front = frontend(wasm, lane)
        if label == "pruned":
            # Remove only module-level Wasm assembly. Preserve body framing and LEB.
            anchor = "\nfunction signature(fn) {"
            if wasm.count(anchor) != 1:
                raise AssertionError("Wasm module assembly boundary moved")
            front = wasm.split(anchor)[0] + "\nglobalThis.typedWasm = {compileFunctions};\n})();\n"
        back = native(rv32, lane)
        run = work / label
        (run/"typed").mkdir(parents=True)
        (run/"editor").mkdir()
        for path, data in [("typed/wasm.js", front.encode()), ("typed/rv32.js", back.encode()),
                           ("typed/world.js", world), ("editor/reactor.bin", reactor), ("editor/editor.typed", source)]:
            (run/path).write_bytes(data)
        results[label] = {"frontendBytes": len(front.encode()), "frontendSha256": sha(front.encode()),
            "backendSha256": sha(back.encode()), "samples": []}
    return {"sourceSha256": sha(source), "reactorSha256": sha(reactor), "linkerSha256": sha(world),
            "treatments": results}


def schedule(seed):
    # With five treatments, these rows and their reverses balance period
    # and the identity of the immediately preceding treatment inside blocks.
    rows = []
    for shift in range(5):
        order = [LANES[(i + shift) % 5] for i in [0, 1, 4, 2, 3]]
        rows.extend([order, list(reversed(order))])
    random.Random(seed).shuffle(rows)
    predecessors = Counter((a,b) for row in rows for a,b in zip(row, row[1:]))
    assert len(predecessors) == 20 and set(predecessors.values()) == {2}
    assert all(set(Counter(row[i] for row in rows).values()) == {2} for i in range(5))
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("gcc")
    parser.add_argument("receipt", type=Path)
    parser.add_argument("--cpu", type=int, required=True)
    args = parser.parse_args()
    rev = git("rev-parse", REV).decode().strip()
    with TemporaryDirectory(prefix="methods-cold-") as name:
        work = Path(name)
        toolchain = build(work, args.gcc, rev)
        receipt = {"revision": rev, "platform": platform.platform(), "tools": toolchain,
                   "cpu": args.cpu, "seed": 1927, **prepare(work)}
        records = receipt["treatments"]
        digest = None
        for block, order in enumerate(schedule(receipt["seed"]), 1):
            for period, label in enumerate(order, 1):
                run = work / label
                output = subprocess.check_output(["taskset", "-c", str(args.cpu), work/"compile"],
                    cwd=run, text=True)
                match = re.search(r"status=ok us=(\d+) peak_js_bytes=(\d+) module_bytes=(\d+)", output)
                if not match:
                    raise ValueError(output)
                us, peak, size = map(int, match.groups())
                module = (run/"compiled.elf").read_bytes()
                if len(module) != size:
                    raise AssertionError("reported ELF size differs")
                observed = sha(module)
                if digest is None:
                    digest = observed
                if digest != observed:
                    raise AssertionError(f"{label} ELF changed")
                records[label]["samples"].append(dict(block=block, position=period, us=us, peak=peak))
        receipt["moduleSha256"] = digest
        receipt["moduleBytes"] = size
        for record in records.values():
            record["medians"] = {key: median(s[key] for s in record["samples"]) for key in ("us", "peak")}
        args.receipt.write_text(json.dumps(receipt, indent=2) + "\n")


if __name__ == "__main__":
    main()
