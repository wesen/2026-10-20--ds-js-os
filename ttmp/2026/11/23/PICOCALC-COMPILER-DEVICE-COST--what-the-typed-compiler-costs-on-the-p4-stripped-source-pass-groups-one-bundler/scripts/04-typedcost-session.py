#!/usr/bin/env python3
"""Run typedcost commands on the experiment image (scripts/02-experiment-tree.py, bench profile) and keep the rows.

usage: 04-typedcost-session.py --build DIR --out OUT [--install] PLAN
       04-typedcost-session.py --summarize OUT

PLAN is a JSON file: a list of blocks {"name", "commands"} (05-session-plan.py), or one list of console commands,
run in order. --install first installs DIR with bench/board/device.install (serial lock, settle, health with
peripherals on). The session holds the serial lock per block: it checks that the running firmware answers typedcost
(the experiment image; else it installs DIR again), runs the block's commands and keeps OUT/uart.log and
OUT/rows.json: one row per compile, the TYPEDCOMPILE record with the TYPEDCOST record of the same compile, the
command and the block it came from. It never touches firmware/PLAYABLE.json; restore the
playable image from the main checkout afterwards (make restore-playable).
"""
import argparse
import json
import statistics
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[6]
sys.path.insert(0, str(REPO / "bench/board"))


def rows_of(log_lines):
    rows, compile_record, command = [], None, None
    for line in log_lines:
        if line.startswith("TYPEDCOMPILE "):
            compile_record = json.loads(line[len("TYPEDCOMPILE "):])
        elif line.startswith("TYPEDCOST "):
            cost = json.loads(line[len("TYPEDCOST "):])
            rows.append({"command": command, **cost, "compile": compile_record})
            compile_record = None
        elif " compile source=typedcost " in line:
            parts = dict(p.split("=", 1) for p in line.split()[2:] if "=" in p)
            pending = {"us": int(parts["us"]), "peak": int(parts["peak_js_bytes"]), "module": int(parts["module_bytes"])}
            rows.append({"summary": pending})
    # Join each summary line (printed before its TYPEDCOMPILE line) with the row that follows it.
    joined, summary = [], None
    for row in rows:
        if "summary" in row:
            summary = row["summary"]
        else:
            joined.append({**row, **(summary or {})})
            summary = None
    return joined


def summarize(out):
    rows = json.loads((out / "rows.json").read_text())
    groups = {}
    for r in rows:
        cold = any(e["bytecode"] == "parsed" for e in (r["compile"] or {}).get("evals", []))
        key = (r["app"], r["strip"], r["backend"], r["padKb"], "cold" if cold else "warm")
        groups.setdefault(key, []).append(r)
    print("| app | strip | backend | pad KB | compile | n | median us | median peak | module bytes | crc |")
    print("|---|---:|---|---:|---|---:|---:|---:|---:|---|")
    for key in sorted(groups):
        g = groups[key]
        print(f"| {key[0]} | {key[1]} | {key[2]} | {key[3]} | {key[4]} | {len(g)} | {statistics.median(r['us'] for r in g):.0f} | "
              f"{statistics.median(r['peak'] for r in g):.0f} | {sorted({r['module'] for r in g})} | "
              f"{sorted({r['moduleCrc'] for r in g})} |")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("plan", type=Path, nargs="?")
    p.add_argument("--build", type=Path)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--install", action="store_true")
    p.add_argument("--summarize", action="store_true")
    p.add_argument("--timeout", type=int, default=120)
    a = p.parse_args()
    if a.summarize:
        return summarize(a.out)
    import device
    plan = json.loads(a.plan.read_text())
    # A plan is a list of blocks {"name", "commands"} (or one list of commands: one block).
    blocks = plan if plan and isinstance(plan[0], dict) else [{"name": "all", "commands": plan}]
    a.out.mkdir(parents=True, exist_ok=False)
    if a.install:
        record = device.install(a.build, a.out / "install", "on")
        print("installed", record["sha256"][:12], flush=True)
    done, installs = [], 0
    for index, block in enumerate(blocks):
        # The lock is held per block; between blocks other agents may use the board. A block whose board no longer
        # runs the experiment image (someone installed theirs) installs it again first.
        while True:
            with device.acquire(), (a.out / "uart.log").open("ab", buffering=0) as log:
                console = device.Console(device.PORT, log)
                try:
                    try:
                        usage = console.command("typedcost", timeout=5)
                    except TimeoutError:
                        usage = []
                    if any(line.startswith("typedcost APP N") for line in usage):
                        uptime = console.uptime_ms()
                        print(f"block {block['name']} ({len(block['commands'])} commands), uptime {uptime / 1000:.0f} s",
                              flush=True)
                        for command in block["commands"]:
                            print(command, flush=True)
                            lines = console.command(command, timeout=a.timeout)
                            for row in rows_of(lines):
                                done.append({**row, "command": command, "block": block["name"], "blockUptimeMs": uptime})
                            (a.out / "rows.json").write_text(json.dumps(done, indent=1) + "\n")
                        break
                finally:
                    console.close()
            installs += 1
            assert installs <= 3, "the experiment image keeps disappearing"
            print(f"block {block['name']}: not the experiment image ({usage[-1:]}); installing again", flush=True)
            device.install(a.build, a.out / f"install-{index:02d}-{installs}", "on")
        time.sleep(5)  # let a waiting agent take the lock
    summarize(a.out)


if __name__ == "__main__":
    main()
