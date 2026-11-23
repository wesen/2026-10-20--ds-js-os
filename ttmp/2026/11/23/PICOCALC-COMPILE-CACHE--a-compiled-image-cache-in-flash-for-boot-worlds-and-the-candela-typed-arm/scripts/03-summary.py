#!/usr/bin/env python3
"""Tables from 01-boots.py's steps.jsonl: per app, cold (miss) against warm (hit) boots.

usage: python3 ttmp/.../scripts/03-summary.py OUT [OUT...]   (writes OUT/summary.json of the first OUT, prints tables)

Cold boots are boot steps whose tag starts with "cold", warm boots those starting with "warm". For each app: the
compile time and its share of the deadline (cold), the hit's total, key and read time (warm), the SHA-256 prefixes of
the compiled and the hit module, and the writer's time per entry; per boot: the first frames (kernel clock in ms, trace on)
and the time from reset to the last boot compile or hit (host clock). Medians over the boots of each kind.
"""
import json
import statistics
import sys
from pathlib import Path

DEADLINE_MS = {"chess": 6000, "chess/painter": 8000, "editor": 6000, "agenda": 4000, "files": 3000, "candela": 8000,
               "raytrace": 8000, "candela-gallery": 300000}


def med(xs):
    xs = [x for x in xs if x is not None]
    return round(statistics.median(xs), 3) if xs else None


def main():
    outs = [Path(p) for p in sys.argv[1:]]
    steps = [json.loads(line) for out in outs for line in (out / "steps.jsonl").read_text().splitlines()]
    boots = [s for s in steps if s["step"].startswith("boot:")]
    kind = lambda s: s["step"].split(":")[1].rstrip("0123456789")
    cold = [s for s in boots if kind(s) == "cold"]
    warm = [s for s in boots if kind(s) == "warm"]
    apps = sorted({c["name"] for s in boots for c in s["compiles"] + s["hits"]})
    table = {}
    for app in apps:
        compiles = [c for s in cold for c in s["compiles"] if c["name"] == app and c["status"] == "ok"]
        hits = [h for s in warm for h in s["hits"] if h["name"] == app]
        stored = [w for s in cold for w in s["stored"] if w["name"] == app]
        misses = [m for s in cold for m in s["misses"] if m["name"] == app]
        table[app] = {
            "coldCompileS": med([c["us"] / 1e6 for c in compiles]),
            "deadlineShare": med([c["us"] / 1e3 / DEADLINE_MS.get(app, 1e9) for c in compiles]),
            "missKeyMs": med([m["keyUs"] / 1e3 for m in misses]),
            "warmHitMs": med([h["us"] / 1e3 for h in hits]),
            "hitKeyMs": med([h["keyUs"] / 1e3 for h in hits]),
            "hitReadMs": med([h["readUs"] / 1e3 for h in hits]),
            "moduleBytes": (compiles or hits or [{}])[0].get("moduleBytes"),
            "writeMs": med([w["writeUs"] / 1e3 for w in stored]),
            "storeMs": med([w["us"] / 1e3 for w in stored]),
            "compiledSha": sorted({c["sha"] for c in compiles}),
            "hitSha": sorted({h["sha"] for h in hits}),
            "n": {"cold": len(compiles), "warm": len(hits)},
        }
    frames = {}
    for label, group in (("cold", cold), ("warm", warm)):
        frames[label] = {app: med([s["firstFrames"].get(app, {}).get("kernelS") for s in group])
                         for app in ("editor", "agenda", "files", "chess")}
        frames[label]["bootWorkS"] = med([max([c["at"] for c in s["compiles"] + s["hits"]
                                               if c["name"] not in ("chess/painter", "candela-gallery")] or [None])
                                          for s in group])
    summary = {"apps": table, "firstFrames": frames, "boots": {"cold": [s["tag"] for s in cold], "warm": [s["tag"] for s in warm]}}
    (outs[0] / "summary.json").write_text(json.dumps(summary, indent=1) + "\n")
    print(f"{'app':16} {'cold s':>7} {'share':>6} {'hit ms':>7} {'key ms':>7} {'read ms':>8} {'write ms':>9} {'bytes':>8}  same")
    for app, r in table.items():
        same = bool(r["compiledSha"]) and r["compiledSha"] == r["hitSha"]
        print(f"{app:16} {r['coldCompileS'] or '-':>7} {r['deadlineShare'] or '-':>6} {r['warmHitMs'] or '-':>7} "
              f"{r['hitKeyMs'] or '-':>7} {r['hitReadMs'] or '-':>8} {r['writeMs'] or '-':>9} {r['moduleBytes'] or '-':>8}  {same}")
    print("first frames (kernel clock, ms since reset; bootWorkS: host s from reset to the last boot compile or hit):",
          json.dumps(frames))


if __name__ == "__main__":
    main()
