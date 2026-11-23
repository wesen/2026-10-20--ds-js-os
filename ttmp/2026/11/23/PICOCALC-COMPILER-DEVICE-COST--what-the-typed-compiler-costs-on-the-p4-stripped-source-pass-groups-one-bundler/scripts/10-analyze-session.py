#!/usr/bin/env python3
"""Tables of the in-image session (04-typedcost-session.py OUT/rows.json), one per experiment of 05-session-plan.py.

usage: 10-analyze-session.py OUT

Per row: total us, the compiler heap peak, load (each evaluated source's bytecode read or parse plus its top level,
outside the call), the call without the pass-group loads inside it, and the core-1 cache counters (L1 data and L2
data misses, L1 and L2 instruction misses). E1 (strip) per app, mode and cold/warm; E2 and E2b (lazy against all)
per app with paired differences; E3 (pad) per app and pad.
"""
import json
import statistics
import sys
from pathlib import Path


def phases(r):
    c = r.get("compile") or {}
    evals = c.get("evals", [])
    out_load = sum(e["loadUs"] + e["runUs"] for e in evals if not e["inCall"])
    in_load = sum(e["loadUs"] + e["runUs"] for e in evals if e["inCall"])
    cold = any(e["bytecode"] == "parsed" for e in evals)
    return {"us": r["us"], "peak": r["peak"], "load": out_load, "inCall": in_load,
            "call": c.get("callUs", 0) - in_load, "free": c.get("freeUs", 0), "cold": cold,
            "realm": max((e["liveBytes"] for e in evals if not e["inCall"]), default=0),
            "l1d": r["l1dMiss"], "l2d": r["l2dMiss"], "l1i": r["l1iMiss"], "l2i": r["l2iMiss"],
            "module": r["module"], "crc": r["moduleCrc"]}


def med(rows, key):
    return statistics.median(p[key] for p in rows)


def line(label, rows):
    return (f"| {label} | {len(rows)} | {med(rows, 'us') / 1000:.1f} | {med(rows, 'load') / 1000:.1f} | "
            f"{med(rows, 'inCall') / 1000:.1f} | {med(rows, 'call') / 1000:.1f} | {med(rows, 'free') / 1000:.1f} | "
            f"{med(rows, 'realm') / 1024:.0f} | {med(rows, 'peak') / 1024:.0f} | {med(rows, 'l1d') / 1e3:.0f} | "
            f"{med(rows, 'l2d') / 1e3:.0f} | {med(rows, 'l1i') / 1e3:.0f} | {med(rows, 'l2i') / 1e3:.0f} | "
            f"{sorted({p['module'] for p in rows})} {sorted({p['crc'] for p in rows})} |")


HEAD = ("| case | n | total ms | load ms | group load in call ms | call ms | free ms | realm KB | peak KB | L1D miss k | "
        "L2D miss k | L1I miss k | L2I miss k | module bytes, crc |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|")


def main():
    out = Path(sys.argv[1])
    rows = json.loads((out / "rows.json").read_text())
    for r in rows:
        r["p"] = phases(r)
    e1 = [r for r in rows if "flush" in r["command"] and "strip=" in r["command"] and r["command"].split()[2] == "2"]
    print("## E1: strip modes (0 none, 1 source, 2 debug)\n\n" + HEAD)
    for app in dict.fromkeys(r["app"] for r in e1):
        for strip in (0, 1, 2):
            for cold in (True, False):
                sel = [r["p"] for r in e1 if r["app"] == app and r["strip"] == strip and r["p"]["cold"] == cold]
                if sel:
                    print(line(f"{app} strip={strip} {'cold' if cold else 'warm'}", sel))
    for name, strip in (("E2", 0), ("E2b", 2)):
        e2 = [r for r in rows if "backend=" in r["command"] and r["command"].split()[2] == "2" and r["strip"] == strip]
        if not e2:
            continue
        print(f"\n## {name}: lazy groups against everything up front (strip={strip}, warm)\n\n" + HEAD)
        for app in dict.fromkeys(r["app"] for r in e2):
            for backend in ("lazy", "all"):
                sel = [r["p"] for r in e2 if r["app"] == app and r["backend"] == backend and not r["p"]["cold"]]
                if sel:
                    print(line(f"{app} {backend}", sel))
            lazy = [r["p"] for r in e2 if r["app"] == app and r["backend"] == "lazy" and not r["p"]["cold"]]
            every = [r["p"] for r in e2 if r["app"] == app and r["backend"] == "all" and not r["p"]["cold"]]
            if lazy and every:
                print(f"| {app} lazy - all (medians) | | {(med(lazy, 'us') - med(every, 'us')) / 1000:+.1f} | "
                      f"{(med(lazy, 'load') - med(every, 'load')) / 1000:+.1f} | | "
                      f"{(med(lazy, 'call') - med(every, 'call')) / 1000:+.1f} | | | | "
                      f"{(med(lazy, 'l1d') - med(every, 'l1d')) / 1e3:+.0f} | {(med(lazy, 'l2d') - med(every, 'l2d')) / 1e3:+.0f} | | | |")
    e3 = [r for r in rows if "pad=" in r["command"]]
    if e3:
        print("\n## E3: the compile's heap moved by a held PSRAM block (strip=0, lazy)\n\n" + HEAD)
        for app in dict.fromkeys(r["app"] for r in e3):
            for pad in sorted({r["padKb"] for r in e3}):
                sel = [r["p"] for r in e3 if r["app"] == app and r["padKb"] == pad]
                if sel:
                    print(line(f"{app} pad={pad} KB", sel))


if __name__ == "__main__":
    main()
