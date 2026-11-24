#!/usr/bin/env python3
"""Summarize one or more compositor soaks (01-compositor-soak.py output directories) from their raw files.

usage (repository root): python3 ttmp/.../scripts/03-soak-summary.py DIR... [--json OUT]

A soak may be stopped and restarted, so this reads samples.jsonl and every uart-*.log rather than summary.json.
Samples are split into boots (the kernel clock goes back). Per boot: the compositor's turns, CPU time and restarts,
its mailbox peak, and its mean CPU per turn in every interval between two samples (about 10 s): the closest the
`worlds` report comes to a longest turn. Crash lines ("[t] W crashed handling TYPE: why") are counted by world from
the UART logs, and the keys injected from the samples' phases are not needed: the per-run summary.json, when present,
gives them.
"""
import argparse
import json
import re
from pathlib import Path

CRASH = re.compile(r"\[\s*([\d.]+)\] (\S+) crashed(?: handling (.*?))?: (.*)$")


def boots(rows):
    out = []
    for r in rows:
        if not out or r["uptimeMs"] < out[-1][-1]["uptimeMs"]:
            out.append([])
        out[-1].append(r)
    return out


def summarize(seg):
    comp = [r["worlds"]["compositor"] for r in seg]
    intervals = []
    for (a, ra), (b, rb) in zip(zip(comp, seg), zip(comp[1:], seg[1:])):
        turns = b["turns"] - a["turns"]
        if turns > 0:
            intervals.append({"meanTurnMs": round((b["cpu_ms"] - a["cpu_ms"]) / turns, 3), "turns": turns,
                              "phase": rb["phase"], "seconds": round(rb["host"] - ra["host"], 1)})
    worst = max(intervals, key=lambda i: i["meanTurnMs"]) if intervals else None
    i2c = [r["buses"]["i2c0"] for r in seg]
    return {
        "uptimeMinutes": [round(seg[0]["uptimeMs"] / 60000, 2), round(seg[-1]["uptimeMs"] / 60000, 2)],
        "samples": len(seg),
        "observedMinutes": round((seg[-1]["host"] - seg[0]["host"]) / 60, 2),
        "compositor": {
            "turns": comp[-1]["turns"] - comp[0]["turns"], "cpuMs": round(comp[-1]["cpu_ms"] - comp[0]["cpu_ms"], 3),
            "meanTurnMs": round((comp[-1]["cpu_ms"] - comp[0]["cpu_ms"]) / max(1, comp[-1]["turns"] - comp[0]["turns"]), 3),
            "restarts": [comp[0]["restarts"], comp[-1]["restarts"]],
            "lastErrors": sorted({c["last_error"] for c in comp}),
            "mboxPeak": max(c["mbox_peak"] for c in comp),
            "worstInterval": worst,
        },
        "i2c0": {"transfers": i2c[-1]["transfers"] - i2c[0]["transfers"], "errors": i2c[-1]["errors"] - i2c[0]["errors"]},
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dirs", nargs="+", type=Path)
    ap.add_argument("--json", type=Path)
    a = ap.parse_args()
    result = {"runs": []}
    for d in a.dirs:
        rows = [json.loads(line) for line in (d / "samples.jsonl").read_text().splitlines() if line.strip()]
        crashes = {}
        for log in sorted(d.glob("uart-*.log")):
            for line in log.read_bytes().decode(errors="replace").splitlines():
                m = CRASH.search(line)
                if m:
                    key = f"{m[2]}: {m[4]}" + (f" (handling {m[3]})" if m[3] else "")
                    crashes[key] = crashes.get(key, 0) + 1
        run = {"dir": str(d), "samples": len(rows), "boots": [summarize(seg) for seg in boots(rows) if len(seg) > 1],
               "crashLines": crashes}
        summary = d / "summary.json"
        if summary.exists():
            s = json.loads(summary.read_text())
            run.update({k: s[k] for k in ("soakedMinutes", "elapsedMinutes", "keys", "keyCounts") if k in s})
        result["runs"].append(run)
    boots_all = [b for r in result["runs"] for b in r["boots"]]
    result["total"] = {
        "observedMinutes": round(sum(b["observedMinutes"] for b in boots_all), 2),
        "compositorTurns": sum(b["compositor"]["turns"] for b in boots_all),
        "compositorRestartsDuringObservation": sum(b["compositor"]["restarts"][1] - b["compositor"]["restarts"][0]
                                                   for b in boots_all),
        "compositorErrors": sorted({e for b in boots_all for e in b["compositor"]["lastErrors"] if e}),
        "worstIntervalMeanTurnMs": max((b["compositor"]["worstInterval"]["meanTurnMs"] for b in boots_all
                                        if b["compositor"]["worstInterval"]), default=None),
        "mboxPeak": max((b["compositor"]["mboxPeak"] for b in boots_all), default=None),
        "i2c0Errors": sum(b["i2c0"]["errors"] for b in boots_all),
    }
    text = json.dumps(result, indent=1)
    if a.json:
        a.json.write_text(text + "\n")
    print(text)


if __name__ == "__main__":
    main()
