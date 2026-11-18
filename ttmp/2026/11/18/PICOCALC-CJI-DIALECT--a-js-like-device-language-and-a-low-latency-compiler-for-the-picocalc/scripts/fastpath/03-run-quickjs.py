#!/usr/bin/env python3
"""Rebuild the vendored QuickJS and test its trusted bytecode against catalog source."""
import argparse
import collections
import difflib
import hashlib
import json
import os
from pathlib import Path
from PIL import Image, ImageChops
import re
import statistics
import subprocess
import tempfile

SCRIPTS = Path(__file__).resolve().parent
ROOT = Path(subprocess.check_output(
    ["git", "rev-parse", "--show-toplevel"], cwd=SCRIPTS, text=True
).strip())
OS = ROOT / "picocalc-os"
QJS = OS / "third_party/quickjs"
JS = OS / "js"
WORKFLOWS = ["boot", "agenda", "files", "calc", "snake", "repl", "faults",
             "settings", "logs", "keys"]
PHASES = ["compile_ns", "write_ns", "read_ns", "compile_base_bytes", "compile_peak_bytes",
          "write_peak_bytes", "read_base_bytes", "read_peak_bytes"]
MEM_COLUMN = re.compile(
    r"^(  (\S+) +\S+ +\S+ +\d+ +[\d.]+ +)([\d.]+)( +\d+ +\d+ .*)$", re.MULTILINE
)
UART_MEM = re.compile(r'(^#OCT1 .*?"mem_kb":)(\d+)', re.MULTILINE)
FAULT_STATS_CPU = re.compile(
    r"^(  sandbox +service +idle +\d+ +)([\d.]+)( +\$MEM.* ran out of memory.*)$", re.MULTILINE
)
FAULT_LOG_TIME = re.compile(r"^(\[ *)([\d.]+)(\] sandbox crashed handling eval: ran out of memory.*)$",
                            re.MULTILINE)
FAULT_RECORD_TIME = re.compile(r'^(#OCT1 {"ev":"fault","t":)([\d.]+)(,"world":"sandbox",'
                               r'.*"why":"ran out of memory.*)$', re.MULTILINE)



def run(cmd, **kwargs):
    return subprocess.run(list(map(str, cmd)), check=True, **kwargs)


def lines_array(name, data):
    yield f"static const uint8_t {name}[] = {{"
    for i in range(0, len(data), 16):
        yield "    " + ", ".join(str(b) for b in data[i:i + 16]) + ","
    yield "};"


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def compile_catalog(work, binary, samples):
    manifest = json.loads((JS / "system.json").read_bytes())
    entries = [("prelude", "prelude.js")]
    entries += [(world["name"], world["file"]) for world in manifest["worlds"]]
    rows = []
    arrays = [
        "typedef struct {",
        "    const char *name;",
        "    const uint8_t *source;",
        "    size_t source_size;",
        "    const uint8_t *bytecode;",
        "    size_t bytecode_size;",
        "} CatalogEntry;",
    ]
    bindings = []
    for i, (name, file) in enumerate(entries):
        print(f"compile {name}", flush=True)
        src = (JS / file).read_bytes()
        blob = work / f"{name}.qbc"
        proc = run([binary, JS / file, file, blob, samples + 1], capture_output=True, text=True)
        *measurements, stripped = [list(map(int, line.split())) for line in proc.stdout.splitlines()]
        strip_source_bytes, strip_debug_bytes = stripped
        metrics = measurements
        if len(metrics) != samples + 1 or any(len(row) != len(PHASES) for row in metrics):
            raise ValueError(f"{name}: unexpected measurement output {proc.stdout!r}")
        bytecode = blob.read_bytes()
        rows.append({
            "world": name,
            "file": file,
            "source_bytes": len(src),
            "source_sha256": sha256(src),
            "bytecode_bytes": len(bytecode),
            "bytecode_sha256": sha256(bytecode),
            "bytecode_first_byte": bytecode[0],
            "strip_source_bytes": strip_source_bytes,
            "strip_debug_bytes": strip_debug_bytes,
            "warmup": dict(zip(PHASES, metrics[0])),
            "median": {phase: statistics.median(column) for phase, column in
                       zip(PHASES, zip(*metrics[1:]))},
            "max": {phase: max(column) for phase, column in zip(PHASES, zip(*metrics[1:]))},
            "p90": {phase: sorted(column)[(9 * samples - 1) // 10] for phase, column in
                    zip(PHASES, zip(*metrics[1:]))},
        })
        arrays.extend(lines_array(f"source_{i}", src))
        arrays.extend(lines_array(f"bytecode_{i}", bytecode))
        bindings.append(f"    {{ \"{file}\", source_{i}, sizeof source_{i}, "
                        f"bytecode_{i}, sizeof bytecode_{i} }},")
    arrays += ["static const CatalogEntry catalog[] = {", *bindings, "};"]
    (work / "quickjs-catalog.inc").write_text("\n".join(arrays) + "\n")
    return rows


def tree_digest(root):
    return {str(path.relative_to(root)): sha256(path.read_bytes())
            for path in sorted(root.rglob("*")) if path.is_file()}


def replay(work, baseline, wrapped, catalog):
    filenames = {row["file"]: row["bytecode_bytes"] for row in catalog}
    results = []
    for name in WORKFLOWS:
        print(f"replay {name}", flush=True)
        pair = {}
        for variant, binary in [("source", baseline), ("bytecode", wrapped)]:
            base = work / "replay" / name / variant
            out = base / "out"
            fs = base / "files"
            store = base / "store"
            out.mkdir(parents=True)
            store.mkdir()
            run(["cp", "-a", OS / "fs-seed", fs])
            command = [binary, "-j", JS, "-f", fs, "-s", store, "-o", out,
                       "-w", "2026-10-22T09:41:00", "-z", "UTC0", OS / "scripts" / f"{name}.txt"]
            proc = run(command, capture_output=True, text=True)
            marker = re.compile(r"^fastpath loaded (.+) \((\d+) bytes\)$", re.MULTILINE)
            observed = marker.findall(proc.stderr)
            if variant == "bytecode":
                observed_files = {file: int(size) for file, size in observed}
                if observed_files != filenames:
                    raise ValueError(f"{name} missing bytecode loads {sorted(filenames.keys() - observed_files.keys())}")
            elif observed:
                raise ValueError(f"{name} unexpected bytecode load during source workflow")
            # Allocator use is observable in stats and expected to differ with bytecode.
            # Preserve both readings but compare other columns and lines verbatim.
            memory = {m[2]: float(m[3]) for m in MEM_COLUMN.finditer(proc.stdout)}
            normalized_stdout = MEM_COLUMN.sub(r"\1$MEM\4", proc.stdout.replace(str(out), "$OUT"))
            normalized_stderr = marker.sub("", proc.stderr).strip()
            uart = (out / "uart.log").read_text()
            fault_memory = [int(match[2]) for match in UART_MEM.finditer(uart)]
            normalized_uart = UART_MEM.sub(r"\1$MEM", uart)
            oom_times = []
            if name == "faults":
                oom_times = [float(m[2]) for pattern, content in [
                    (FAULT_STATS_CPU, normalized_stdout), (FAULT_LOG_TIME, normalized_uart),
                    (FAULT_RECORD_TIME, normalized_uart),
                ] for m in pattern.finditer(content)]
                normalized_stdout = FAULT_STATS_CPU.sub(r"\1$OOM_MS\3", normalized_stdout)
                normalized_uart = FAULT_RECORD_TIME.sub(r"\1$OOM_MS\3",
                      FAULT_LOG_TIME.sub(r"\1$OOM_MS\3", normalized_uart))
            pair[variant] = {
                "stdout": normalized_stdout,
                "stderr": normalized_stderr,
                "uart": normalized_uart,
                "screens": {p.name: sha256(p.read_bytes()) for p in sorted(out.glob("*.png"))},
                "files": tree_digest(fs),
                "store": tree_digest(store),
                "memory_kb": memory,
                "fault_memory_kb": fault_memory,
                "oom_times_ms": oom_times,
                "loads": dict(sorted(collections.Counter(file for file, _ in observed).items())),
            }
        source, bytecode = pair["source"], pair["bytecode"]
        if not source["screens"]:
            raise RuntimeError(f"{name} produced no screenshot")
        about = None
        if name == "keys":
            filename = "41-about.png"
            with (Image.open(work / "replay" / name / "source" / "out" / filename) as image_a,
                  Image.open(work / "replay" / name / "bytecode" / "out" / filename) as image_b):
                bbox = ImageChops.difference(image_a.convert("RGB"), image_b.convert("RGB")).getbbox()
            if bbox and not (235 <= bbox[0] < bbox[2] <= 325 and 460 <= bbox[1] < bbox[3] <= 483):
                raise RuntimeError(f"About: changes outside the aggregate heap reading {bbox}")
            about = {
                "pixel_change_bbox": bbox,
                "source_sha256": source["screens"].pop(filename),
                "bytecode_sha256": bytecode["screens"].pop(filename),
            }
        if name == "faults":
            if (len(source["oom_times_ms"]) != 3 or len(bytecode["oom_times_ms"]) != 3
                    or any(abs(a - b) > 0.02
                           for a, b in zip(source["oom_times_ms"], bytecode["oom_times_ms"]))):
                raise RuntimeError(f"{name} unexpected OOM timing change {pair}")
        for key in sorted(source.keys() - {"loads", "memory_kb", "fault_memory_kb", "oom_times_ms"}):
            if source[key] != bytecode[key]:
                (work / f"mismatch-{name}-{key}.json").write_text(json.dumps(pair, indent=2) + "\n")
                if key != "stdout":
                    raise RuntimeError(f"{name} differs in {key}")
                raise RuntimeError(f"{name} differs in stdout\n"
                                   + "\n".join(difflib.unified_diff(
                                       source[key].splitlines(), bytecode[key].splitlines(),
                                       fromfile="source", tofile="bytecode", lineterm="")))
        results.append({
            "workflow": name,
            "stdout_sha256": sha256(source["stdout"].encode()),
            "stderr_sha256": sha256(source["stderr"].encode()),
            "uart_sha256": sha256(source["uart"].encode()),
            "screens_sha256": source["screens"],
            "about_heap_image": about,
            "files_sha256": source["files"],
            "store_sha256": source["store"],
            "bytecode_loads": bytecode["loads"],
            "source_memory_kb": source["memory_kb"],
            "bytecode_memory_kb": bytecode["memory_kb"],
            "source_fault_memory_kb": source["fault_memory_kb"],
            "bytecode_fault_memory_kb": bytecode["fault_memory_kb"],
            "source_oom_times_ms": source["oom_times_ms"],
            "bytecode_oom_times_ms": bytecode["oom_times_ms"],
        })
    return results


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--output", required=True, type=Path, help="write the JSON receipt here")
    p.add_argument("--samples", default=21, type=int)
    p.add_argument("--jobs", default=2, type=int)
    p.add_argument("--compile-only", action="store_true", help="skip building the simulator")
    p.add_argument("--work-dir", type=Path, help="use an existing empty directory and keep scratch files")
    args = p.parse_args()
    if args.samples < 1:
        p.error("--samples must be positive")
    if args.work_dir and (not args.work_dir.is_dir() or any(args.work_dir.iterdir())):
        p.error("--work-dir must be an existing empty directory")
    if args.work_dir:
        measure(args.work_dir.resolve(), args)
    else:
        with tempfile.TemporaryDirectory(prefix="picocalc-quickjs-") as tmp:
            measure(Path(tmp), args)


def measure(work, args):
    qjs_version = (QJS / "VERSION").read_text().strip()
    eng = work / "build/eng"
    engine_paths = [eng / f"{name}.o" for name in [
        "quickjs", "libregexp", "libunicode", "cutils", "dtoa",
    ]]
    build = ["make", "-C", OS, f"-j{args.jobs}", f"BUILD={work / 'build'}"]
    run([*build, *engine_paths], stdout=subprocess.DEVNULL)
    binary = work / "compile-quickjs"
    run(["cc", "-O2", "-std=gnu11", "-Wall", "-Wextra", "-Wno-unused-parameter",
         "-Wno-cast-function-type", "-I", QJS, SCRIPTS / "01-compile-quickjs.c", *engine_paths,
         "-lm", "-o", binary])
    rows = compile_catalog(work, binary, args.samples)
    result = {
        "revision": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "quickjs_version": qjs_version,
        "compiler": subprocess.check_output(["cc", "--version"], text=True).splitlines()[0],
        "system": " ".join(os.uname()[i] for i in [0, 2, 4]),
        "cpu": re.search(r"^model name\s*:\s*(.*)$", Path("/proc/cpuinfo").read_text(), re.M)[1],
        "clock": "CLOCK_MONOTONIC",
        "workflow_clock": "2026-10-22T09:41:00 UTC0",
        "samples_per_source": args.samples,
        "worlds": rows,
    }
    if not args.compile_only:
        baseline = work / "source-host"
        wrapped = work / "bytecode-host"
        wrapper = work / "replay-quickjs.o"
        run([*build, f"BIN={baseline}"], stdout=subprocess.DEVNULL)
        run(["cc", "-O2", "-std=gnu11", "-Wall", "-Wextra", "-Wno-unused-parameter",
             "-Wno-cast-function-type", "-I", QJS, "-I", work, "-c",
             SCRIPTS / "02-replay-quickjs.c", "-o", wrapper])
        run([*build, f"BIN={wrapped}", f"LDFLAGS=-Wl,--wrap=JS_Eval {wrapper}"],
            stdout=subprocess.DEVNULL)
        result["workflow_replays"] = replay(work, baseline, wrapped, rows)
    args.output.write_text(json.dumps(result, indent=2) + "\n")


if __name__ == "__main__":
    main()
