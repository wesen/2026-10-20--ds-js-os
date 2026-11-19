#!/usr/bin/env python3
"""Pair fresh Linux QuickJS runs through the firmware's real Editor compile and link functions."""
import argparse
import hashlib
import json
import platform
import re
import statistics
import subprocess
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip())
OS = ROOT / "picocalc-os"
P4 = OS / "port/esp32p4/main"
SDK = OS / "sdk"

def git(*args):
    return subprocess.check_output(["git", "-C", ROOT, *args])

def sha(data):
    return hashlib.sha256(data).hexdigest()

def measure(tmp, args):
    # The port header references FreeRTOS for an unused bus queue declaration.
    headers = tmp / "freertos"
    headers.mkdir()
    (headers / "FreeRTOS.h").write_text("")
    (headers / "queue.h").write_text("typedef void *QueueHandle_t;\n")
    qjs = OS / "third_party/quickjs"
    exe = tmp / "compile"
    subprocess.run(["cc", "-O2", "-D_POSIX_C_SOURCE=200809L", "-DPICOCALC_TYPED_EDITOR=1",
                    "-DPICOCALC_RV32_EDITOR=1", "-I", tmp, "-I", P4, "-I", OS/"nucleus",
                    "-I", qjs, HERE/"cold-entry.c", P4/"typed_p4.c", P4/"editor_p4.c",
                    *sorted((OS/"build/qjs").glob("*.o")), "-lm", "-lpthread", "-o", exe], check=True)
    reactor = tmp/"reactor.elf"
    subprocess.run([args.gcc, "-march=rv32imafc_zicsr_zifencei", "-mabi=ilp32f", "-Os",
                    "-fPIC", "-shared", "-nostartfiles", "-nostdlib", "-e", "app_main",
                    "-ffunction-sections", "-fdata-sections", "-Wl,--gc-sections", "-fvisibility=hidden",
                    "-Wl,--strip-all", "-Wl,-z,max-page-size=16", "-Wno-attributes", "-I", SDK,
                    "-o", reactor, SDK/"typed/world.c", SDK/"typed/rv32-slot.S", SDK/"nw_elf.c",
                    qjs/"libunicode.c"], check=True)
    app = OS/"worlds/editor"
    source = b"".join((app/name).read_bytes() + b"\n" for name in (app/"source.list").read_text().splitlines())
    data = {}
    for label, rev in (("baseline", args.base), ("candidate", args.candidate)):
        work = tmp/label
        (work/"typed").mkdir(parents=True)
        (work/"editor").mkdir()
        for kind in ("wasm", "rv32", "world"):
            path = f"picocalc-os/compiler/typed-{kind}.js"
            content = git("show", f"{rev}:{path}") if rev != "worktree" else (ROOT/path).read_bytes()
            (work/f"typed/{kind}.js").write_bytes(content)
        (work/"editor/editor.typed").write_bytes(source)
        (work/"editor/reactor.bin").write_bytes(reactor.read_bytes())
        data[label] = {"revision": git("rev-parse", rev).decode().strip() if rev != "worktree" else rev,
                       "backend_sha256": sha((work/"typed/rv32.js").read_bytes()), "samples": []}
    for i in range(args.pairs):
        order = ("baseline","candidate") if i % 2 == 0 else ("candidate","baseline")
        for label in order:
            work = tmp/label
            receipt = subprocess.check_output([exe], cwd=work, text=True)
            match = re.search(r"status=ok us=(\d+) peak_js_bytes=(\d+) module_bytes=(\d+)", receipt)
            if not match:
                raise ValueError(receipt)
            us, peak, size = map(int, match.groups())
            digest = sha((work/"compiled.elf").read_bytes())
            record = data[label]
            if digest != record.setdefault("module_sha256", digest):
                raise RuntimeError("Repeated compilation changed output")
            record["samples"].append({"pair":i+1, "order":order.index(label)+1,
                                     "us":us, "peak_js_bytes":peak, "module_bytes":size})
            if i == 0 and args.modules_out:
                args.modules_out.mkdir(parents=True, exist_ok=True)
                (args.modules_out / (label + ".elf")).write_bytes((work/"compiled.elf").read_bytes())
    for record in data.values():
        record["median"] = {key:statistics.median([s[key] for s in record["samples"]])
                            for key in ("us","peak_js_bytes","module_bytes")}
    return {"machine":platform.machine(), "system":platform.system(), "quickjs":(qjs/"VERSION").read_text().strip(),
            "gcc":subprocess.check_output([args.gcc, "--version"],text=True).splitlines()[0],
            "source_sha256":sha(source),"reactor_sha256":sha(reactor.read_bytes()),"results":data}

if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("gcc", help="path to ESP RV32 GCC")
    p.add_argument("--base",default="dd69a81")
    p.add_argument("--candidate",default="HEAD")
    p.add_argument("--pairs",type=int,default=12)
    p.add_argument("--modules-out",type=Path,help="optional directory for replaying the exact timed ELF files")
    a = p.parse_args()
    if a.pairs < 1:
        p.error("pairs must be positive")
    with tempfile.TemporaryDirectory() as tmp:
        print(json.dumps(measure(Path(tmp),a), indent=2))
