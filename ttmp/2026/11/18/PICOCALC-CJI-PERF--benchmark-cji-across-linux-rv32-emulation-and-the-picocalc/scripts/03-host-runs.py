"""Alternate plain/instrumented AOT builds and heap sizes. Run from repo root."""
import argparse
import hashlib
import itertools
import json
import os
from pathlib import Path
import re
import resource
import subprocess
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("out", type=Path)
parser.add_argument("--repeats", type=int, default=7)
args = parser.parse_args()
out = args.out.resolve()


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def cpu_us():
    usage = resource.getrusage(resource.RUSAGE_CHILDREN)
    return round((usage.ru_utime + usage.ru_stime) * 1e6)


configs = list(itertools.product(("plain", "measured"), (("files", 8), ("agenda", 8), ("agenda", 10))))
with (out / "host-runs.jsonl").open("w") as results:
    for ordinal in range(args.repeats + 1):
        for variant, (world, mib) in configs[::1 if ordinal % 2 else -1]:
            exe = out / f"stage1-{variant}"
            source = Path(f"picocalc-os/js/apps/{world}.js")
            size = mib * 1024**2
            prefix = f"{world}-{mib}-{variant}-{ordinal}"
            stats = out / f"{prefix}.stats"
            dest = out / "host-output.slir"
            command = [str(exe), "-g", "-C", "-h", str(size), "-H", str(size), "--", str(source), "--world-unit"]
            with dest.open("wb") as stdout, stats.open("wb") as stderr:
                cpu0 = cpu_us()
                t0 = time.monotonic_ns()
                subprocess.run(command, stdout=stdout, stderr=stderr, check=True)
                elapsed_us = (time.monotonic_ns() - t0) // 1000
                used_cpu_us = cpu_us() - cpu0
            text = stats.read_text()
            gc = re.search(r"(\d+) collections, (\d+) bytes copied, heap now (\d+) bytes, most live (\d+) bytes", text)
            measured = re.search(r"frontend_us=(\d+) gc_us=(\d+) slide_bytes=(\d+)", text)
            if not gc or (variant == "measured" and not measured):
                raise ValueError(text)
            sha = digest(dest)
            if sha != digest(out / f"{world}.ref"):
                raise ValueError(f"{prefix}: mismatched frontend output")
            row = dict(suite="frontend", target="linux-aot", world=world, executable_sha256=digest(exe),
                       source_sha256=digest(source), slir_sha256=sha, verified=True, collector="compact",
                       heap_bytes=size, variant=variant, ordinal=ordinal, warmup=ordinal == 0,
                       affinity=sorted(os.sched_getaffinity(0)), process_elapsed_us=elapsed_us,
                       process_cpu_us=used_cpu_us, collections=int(gc[1]), survivor_bytes=int(gc[2]),
                       live_peak_bytes=int(gc[4]), frontend_us=int(measured[1]) if measured else None,
                       gc_us=int(measured[2]) if measured else None,
                       slide_bytes=int(measured[3]) if measured else None, stats_file=stats.name)
            print(json.dumps(row), file=results, flush=True)
