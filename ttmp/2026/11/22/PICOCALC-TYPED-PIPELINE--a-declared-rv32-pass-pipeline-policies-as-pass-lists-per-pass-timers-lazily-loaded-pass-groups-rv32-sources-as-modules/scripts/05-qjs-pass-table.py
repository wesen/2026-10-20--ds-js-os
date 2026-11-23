#!/usr/bin/env python3
"""Per-pass timing table in bare QuickJS (04-qjs-pass-timing.c) for the five workloads.

usage: 05-qjs-pass-table.py --harness BIN --sources DIR [--rounds N] [--json OUT] [--rv32 FILE ...] COMPILER_DIR

DIR holds NAME.typed from `03-pass-timing.mjs --write-sources DIR`. COMPILER_DIR is a compiler/typed directory;
the realm loads tape.js, typed-wasm.js, typed-async.js, typed-world.js and the RV32 backend: typed-rv32.js, or
the --rv32 FILEs in order (a split bundle). Each workload runs ROUNDS + 1 fresh runtimes (default 5) with the
device's bytecode cache: the first parses the files and is dropped, the others read the bytecode. The table is
the median per pass, with the median load time, the memory after loading and the peak.
"""
import argparse, json, statistics, subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
WORKLOADS = [("agenda", "interactive", "none"), ("editor", "interactive", "world"), ("files", "default", "world"),
             ("playableChess", "balanced", "world"), ("ray", "kernel", "none"), ("agenda", "kernel", "none"),
             ("editor", "kernel", "world"), ("files", "kernel", "world"), ("playableChess", "kernel", "world")]
ORDER = ["frontend", "storeless", "inline", "guarded", "pie", "commute", "conjunctions", "sets", "rotate", "ranges",
         "version", "split", "facts", "leaf", "plan", "emit", "candidate", "compile"]


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--harness", required=True)
    p.add_argument("--sources", type=Path, required=True)
    p.add_argument("--rounds", type=int, default=5)
    p.add_argument("--json", type=Path)
    p.add_argument("--rv32", nargs="*")
    p.add_argument("--only", help="comma-separated workload names")
    p.add_argument("compiler", type=Path)
    a = p.parse_args()
    c = a.compiler
    rv32 = a.rv32 or [str(c / "typed-rv32.js")]
    files = [str(c / "tape.js"), str(c / "typed-wasm.js"), str(c / "typed-async.js"), *rv32, str(c / "typed-world.js")]
    table = []
    for name, policy, imports in WORKLOADS:
        if a.only and name not in a.only.split(","):
            continue
        out = subprocess.run([a.harness, str(a.rounds + 1), str(a.sources / (name + ".typed")), policy, imports,
                              str(HERE / "pass-totals.js"), "cache", *files], check=True, capture_output=True, text=True).stdout
        runs = [json.loads(line) for line in out.splitlines()][1:]
        passes = {}
        for key in {k for r in runs for k in r["result"]["totals"]}:
            passes[key] = statistics.median(r["result"]["totals"].get(key, {"ms": 0})["ms"] for r in runs)
        table.append({"workload": name, "policy": policy, "bytes": runs[0]["result"]["bytes"],
                      "load_ms": statistics.median(r["load_us"] for r in runs) / 1e3,
                      "load_bytes": statistics.median(r["load_bytes"] for r in runs),
                      "peak_bytes": statistics.median(r["peak_bytes"] for r in runs), "passes": passes})
    if a.json:
        a.json.write_text(json.dumps(table, indent=1) + "\n")
    columns = [k for k in ORDER if any(k in row["passes"] for row in table)]
    print("| Workload, policy | load | " + " | ".join(columns) + " | load KB | peak KB |")
    print("|---|---:|" + "|".join("---:" for _ in columns) + "|---:|---:|")
    for row in table:
        cells = [f"{row['passes'][k]:.1f}" if k in row["passes"] else "" for k in columns]
        print(f"| {row['workload']}, {row['policy']} | {row['load_ms']:.1f} | " + " | ".join(cells) +
              f" | {row['load_bytes'] / 1024:.0f} | {row['peak_bytes'] / 1024:.0f} |")


if __name__ == "__main__":
    main()
