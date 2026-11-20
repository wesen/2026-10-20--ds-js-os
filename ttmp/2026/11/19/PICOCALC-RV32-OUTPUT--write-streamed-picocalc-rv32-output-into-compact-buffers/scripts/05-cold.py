#!/usr/bin/env python3
"""Measure fresh vendored QuickJS processes across the three native output modes."""
import argparse
import hashlib
import json
import platform
import re
import statistics
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
OS = ROOT / "picocalc-os"
P4 = OS / "port/esp32p4/main"
QJS = OS / "third_party/quickjs"
MODES = ("baseline", "compact", "direct")
PHASES = ("frontend", "lowering", "assembly", "abi", "slot_scan", "slot_output",
          "js_return", "runtime_scripts", "arguments", "c_handoff", "runtime_teardown")
SCHEDULE = ((0, 1, 2), (1, 2, 0), (2, 0, 1), (0, 2, 1), (2, 1, 0), (1, 0, 2))

TOTAL = re.compile(r"status=ok us=(\d+) peak_js_bytes=(\d+) module_bytes=(\d+)")
PHASE = re.compile(r"output phase=(\d+) us=(\d+) entry=(\d+) exit=(\d+) peak=(\d+) updates=(\d+) runs=(\d+)")


def git(*args):
    return subprocess.check_output(["git", "-C", ROOT, *args])


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write_inputs(work, reactors):
    def pinned(path):
        return git("show", f"6426798:picocalc-os/{path}")

    sources = {
        "files": pinned("worlds/files/files.typed"),
        "agenda": b"\n".join(pinned(f"worlds/agenda/{name}")
                             for name in ("reminder.typed", "entry.typed")),
        "editor": b"".join(pinned(f"worlds/editor/{name}") + b"\n"
                           for name in pinned("worlds/editor/source.list").decode().splitlines()),
    }
    files = {"files": "files-reactor.elf", "agenda": "agenda-reactor.elf", "editor": "typed-world-reactor.elf"}
    inputs = {}
    for app, source in sources.items():
        reactor = (reactors / files[app]).read_bytes()
        dest = work / app
        dest.mkdir(parents=True, exist_ok=True)
        (dest / "program.typed").write_bytes(source)
        (dest / "reactor.bin").write_bytes(reactor)
        inputs[app] = {"source_sha256": sha(source), "reactor_sha256": sha(reactor),
                       "source_bytes": len(source), "reactor_bytes": len(reactor)}
    return inputs


def profiled_entry(source):
    edits = [
        ("static void account(", '#include "04-profile.h"\n\nstatic void account('),
        ("  if (heap->live > heap->peak)", "  profile_alloc(heap->live);\n  if (heap->live > heap->peak)"),
        ("  JSRuntime *rt = JS_NewRuntime2", "  profile_enter(PHASE_RUNTIME, 0);\n  JSRuntime *rt = JS_NewRuntime2"),
        ("  JS_SetMaxStackSize", "  JS_SetRuntimeOpaque(rt, &heap);\n  JS_SetMaxStackSize"),
        ("  JSValue function = JS_GetPropertyStr(ctx, global, entry);",
         """  JS_SetPropertyStr(ctx, global, "outputPhase", JS_NewCFunction(ctx, output_phase, "outputPhase", 1));
  profile_enter(PHASE_ARGUMENTS, heap.live);
  JSValue function = JS_GetPropertyStr(ctx, global, entry);"""),
        ("  if (ready) result = JS_Call(ctx, function, JS_UNDEFINED, argc, args);",
         "  if (ready) result = JS_Call(ctx, function, JS_UNDEFINED, argc, args);\n  profile_enter(PHASE_HANDOFF, heap.live);"),
        ("done:\n  if (ctx)", "done:\n  profile_enter(PHASE_TEARDOWN, heap.live);\n  if (ctx)"),
        ("  if (rt) JS_FreeRuntime(rt);", "  if (rt) JS_FreeRuntime(rt);\n  profile_report(heap.live);"),
    ]
    for old, new in edits:
        if source.count(old) != 1:
            raise ValueError(f"profile anchor changed: {old!r}")
        source = source.replace(old, new, 1)
    return source


def build(work, profiled):
    freertos = work / "freertos"
    freertos.mkdir(exist_ok=True)
    (freertos / "FreeRTOS.h").write_text("")
    (freertos / "queue.h").write_text("typedef void *QueueHandle_t;\n")
    qjs_build = work / "host-build"
    objects = [qjs_build / "eng" / (unit + ".o")
               for unit in ("quickjs", "libregexp", "libunicode", "cutils", "dtoa")]
    subprocess.run(["make", "-C", OS, "-j4", f"BUILD={qjs_build}", *objects],
                   stdout=sys.stderr, check=True)
    production = P4 / "typed_p4.c"
    c_entry = work / "typed_p4.c"
    baseline_bytes = git("show", "6426798:picocalc-os/port/esp32p4/main/typed_p4.c")
    if production.read_bytes() != baseline_bytes:
        raise ValueError("production host entry differs from pinned revision")
    c_entry.write_text(profiled_entry(baseline_bytes.decode()) if profiled else baseline_bytes.decode())
    exe = work / "typed-cold"
    subprocess.run(["cc", "-O2", "-D_POSIX_C_SOURCE=200809L", "-DPICOCALC_TYPED_EDITOR=1", "-I", HERE, "-I", work,
                    "-I", P4, "-I", OS / "nucleus", "-I", QJS, HERE / "03-cold-entry.c",
                    c_entry, *objects, "-lm", "-lpthread", "-o", exe], check=True)
    provenance = {
        "cc": subprocess.check_output(["cc", "--version"], text=True).splitlines()[0],
        "quickjs_version": (QJS / "VERSION").read_text().strip(),
        "quickjs_tree": git("rev-parse", "6426798:picocalc-os/third_party/quickjs").decode().strip(),
        "c_entry_sha256": sha(c_entry.read_bytes()),
        "makefile_sha256": sha((OS / "Makefile").read_bytes()),
        "object_sha256": {obj.name: sha(obj.read_bytes()) for obj in objects},
    }
    return exe, provenance


def run(work, reactors, blocks, profiled):
    exe, provenance = build(work, profiled)
    inputs = write_inputs(work / "inputs", reactors)
    paths = {}
    digests = {}
    for mode in MODES:
        dest = work / mode
        flags = ["--profile"] if profiled else []
        subprocess.run([sys.executable, HERE / "01-prepare.py", "--mode", mode, "--out", dest, *flags], check=True)
        write_inputs(dest, reactors)
        paths[mode] = dest
        digests[mode] = {str(path.relative_to(dest)): sha(path.read_bytes()) for path in sorted(dest.rglob("*.js"))}
    apps = {}
    for app in inputs:
        results = {mode: {"samples": []} for mode in MODES}
        for block in range(blocks):
            for order, index in enumerate(SCHEDULE[block % len(SCHEDULE)], 1):
                mode = MODES[index]
                folder = paths[mode]
                stdout = subprocess.check_output([exe, app], cwd=folder, text=True)
                match = TOTAL.search(stdout)
                if not match:
                    raise ValueError(stdout)
                elapsed, peak, file_size = map(int, match.groups())
                artifact = (folder / "compiled.elf").read_bytes()
                digest = sha(artifact)
                assert len(artifact) == file_size
                assert digest == results[mode].setdefault("elf_sha256", digest)
                assert digest == results["baseline"]["elf_sha256"]
                record = {"block": block + 1, "order": order, "us": elapsed, "peak_js_bytes": peak, "elf_bytes": file_size}
                if profiled:
                    rows = [list(map(int, m.groups())) for m in PHASE.finditer(stdout)]
                    assert [row[0] for row in rows] == list(range(len(PHASES)))
                    keys = ("us", "first_entry_live", "last_exit_live", "peak_live", "allocation_updates", "visits")
                    record["phases"] = {PHASES[row[0]]: dict(zip(keys, row[1:])) for row in rows}
                    assert max(ph["peak_live"] for ph in record["phases"].values()) == peak
                results[mode]["samples"].append(record)
        for mode in MODES:
            record = results[mode]
            record["medians"] = {key: statistics.median(sample[key] for sample in record["samples"])
                                 for key in ("us", "peak_js_bytes", "elf_bytes")}
            if profiled:
                record["phase_medians"] = {
                    phase: {key: statistics.median(sample["phases"][phase][key] for sample in record["samples"])
                            for key in record["samples"][0]["phases"][phase]} for phase in PHASES}
        apps[app] = {**inputs[app], "modes": results}
    return {"profiled": profiled, "blocks": blocks, "machine": platform.machine(),
            "system": platform.system(), "build": provenance, "sources": digests, "apps": apps}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reactors", required=True, type=Path, help="ESP-IDF build/esp-idf/main with three ELF reactors")
    parser.add_argument("--work", required=True, type=Path, help="scratch directory for builds and generated sources")
    parser.add_argument("--blocks", default=6, type=int)
    parser.add_argument("--profile", action="store_true")
    args = parser.parse_args()
    if args.blocks <= 0:
        parser.error("--blocks must be positive")
    args.work.mkdir(parents=True, exist_ok=True)
    result = run(args.work.resolve(), args.reactors.resolve(), args.blocks, args.profile)
    print(json.dumps(result, separators=(",", ":")) if args.profile else json.dumps(result, indent=2))
