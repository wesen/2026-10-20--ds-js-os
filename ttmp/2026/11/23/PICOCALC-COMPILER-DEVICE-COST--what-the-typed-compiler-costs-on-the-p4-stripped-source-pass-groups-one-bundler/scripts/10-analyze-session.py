#!/usr/bin/env python3
"""Tables of the in-image session (04-typedcost-session.py OUT/rows.json), one per block of 05-session-plan.py.

usage: 10-analyze-session.py OUT [OUT ...]   (the rows of several sessions together)

Per row: total ms, load (each evaluated source's bytecode read or parse plus its top level, outside the call), the
pass-group loads inside the call, the call without them, the teardown, the realm after loading, the compiler heap
peak, the calls to the port heap (mallocs + frees + reallocs) and the time inside them, and the core-1 cache counters
(L1 data and L2 data misses, L1 and L2 instruction misses); medians. E1a+E1b (strip) per app, mode and cold/warm;
E2, E2p and E2b (lazy against all) per app with the difference of medians; E3 (pad) per app and pad; E4 (parking)
per app.
"""
import json
import statistics
import sys
from pathlib import Path


def phases(r):
    c = r.get("compile") or {}
    evals = c.get("evals", [])
    heap = c.get("heap", {})
    out_load = sum(e["loadUs"] + e["runUs"] for e in evals if not e["inCall"])
    in_load = sum(e["loadUs"] + e["runUs"] for e in evals if e["inCall"])
    cold = any(e["bytecode"] == "parsed" for e in evals)
    return {"us": r["us"], "peak": r["peak"], "load": out_load, "inCall": in_load,
            "call": c.get("callUs", 0) - in_load, "free": c.get("freeUs", 0), "cold": cold,
            "realm": max((e["liveBytes"] for e in evals if not e["inCall"]), default=0),
            "calls": sum(heap.get(k, 0) for k in ("mallocs", "frees", "reallocs")), "heapUs": heap.get("us", 0),
            "l1d": r["l1dMiss"], "l2d": r["l2dMiss"], "l1i": r["l1iMiss"], "l2i": r["l2iMiss"],
            "module": r["module"], "crc": r["moduleCrc"]}


def med(rows, key):
    return statistics.median(p[key] for p in rows)


def line(label, rows):
    return (f"| {label} | {len(rows)} | {med(rows, 'us') / 1000:.1f} | {med(rows, 'load') / 1000:.1f} | "
            f"{med(rows, 'inCall') / 1000:.1f} | {med(rows, 'call') / 1000:.1f} | {med(rows, 'free') / 1000:.1f} | "
            f"{med(rows, 'realm') / 1024:.0f} | {med(rows, 'peak') / 1024:.0f} | {med(rows, 'calls'):.0f} | "
            f"{med(rows, 'heapUs') / 1000:.1f} | {med(rows, 'l1d') / 1e3:.0f} | "
            f"{med(rows, 'l2d') / 1e3:.0f} | {med(rows, 'l1i') / 1e3:.0f} | {med(rows, 'l2i') / 1e3:.0f} | "
            f"{sorted({p['module'] for p in rows})} {sorted({p['crc'] for p in rows})} |")


def diff(label, a, b):
    keys = ("us", "load", "inCall", "call", "free", "realm", "peak", "calls", "heapUs", "l1d", "l2d", "l1i", "l2i")
    scale = {"realm": 1024, "peak": 1024, "calls": 1, "l1d": 1e3, "l2d": 1e3, "l1i": 1e3, "l2i": 1e3}
    cells = [f"{(med(a, k) - med(b, k)) / scale.get(k, 1000):+.1f}" for k in keys]
    return f"| {label} | | " + " | ".join(cells) + " | |"


HEAD = ("| case | n | total ms | load ms | group load in call ms | call ms | free ms | realm KB | peak KB | heap calls | "
        "heap ms | L1D miss k | L2D miss k | L1I miss k | L2I miss k | module bytes, crc |\n"
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|")


def main():
    rows = [r for out in sys.argv[1:] for r in json.loads((Path(out) / "rows.json").read_text())]
    for r in rows:
        r["p"] = phases(r)

    def by(*names):
        return [r for r in rows if r.get("block") in names]

    e1 = by("E1a", "E1b")
    print("## E1: strip modes (0 none, 1 source, 2 debug), parking on\n\n" + HEAD)
    for app in dict.fromkeys(r["app"] for r in e1):
        for strip in (0, 1, 2):
            for cold in (True, False):
                sel = [r["p"] for r in e1 if r["app"] == app and r["strip"] == strip and r["p"]["cold"] == cold]
                if sel:
                    print(line(f"{app} strip={strip} {'cold' if cold else 'warm'}", sel))
    titles = {"E2": "unstripped, no parking", "E2p": "unstripped, parking", "E2b": "strip 2, parking (production)"}
    for name, title in titles.items():
        e2 = [r for r in by(name) if "backend=" in r["command"] and r["command"].split()[2] == "2"]
        if not e2:
            continue
        print(f"\n## {name}: lazy groups against everything up front ({title}, warm)\n\n" + HEAD)
        for app in dict.fromkeys(r["app"] for r in e2):
            arms = {b: [r["p"] for r in e2 if r["app"] == app and r["backend"] == b and not r["p"]["cold"]]
                    for b in ("lazy", "all")}
            for backend, sel in arms.items():
                if sel:
                    print(line(f"{app} {backend}", sel))
            if arms["lazy"] and arms["all"]:
                print(diff(f"{app} lazy - all", arms["lazy"], arms["all"]))
    e3 = [r for r in by("E3") if "pad=" in r["command"]]
    if e3:
        print("\n## E3: the compile's heap moved by a held PSRAM block (unstripped, lazy, no parking)\n\n" + HEAD)
        for app in dict.fromkeys(r["app"] for r in e3):
            for pad in sorted({r["padKb"] for r in e3}):
                sel = [r["p"] for r in e3 if r["app"] == app and r["padKb"] == pad]
                if sel:
                    print(line(f"{app} pad={pad} KB", sel))
    e4 = [r for r in by("E4") if "park=" in r["command"] and r["command"].split()[2] == "2"]
    if e4:
        print("\n## E4: arena parking off (0) and on (1), strip 2, warm\n\n" + HEAD)
        for app in dict.fromkeys(r["app"] for r in e4):
            arms = {park: [r["p"] for r in e4 if r["app"] == app and r.get("park") == park and not r["p"]["cold"]]
                    for park in (0, 1)}
            for park, sel in arms.items():
                if sel:
                    print(line(f"{app} park={park}", sel))
            if arms[0] and arms[1]:
                print(diff(f"{app} on - off", arms[1], arms[0]))


if __name__ == "__main__":
    main()
