#!/usr/bin/env python3
"""11-cost-table.py: tables of instructions per sample from 07-rv32-count.py and 08-kernel-digest.py --rv32.

usage: python3 -I 11-cost-table.py OUT.json [--harness LABEL=COUNTS.jsonl ...] [--kernel KD.jsonl] [--calls AGREE.jsonl [--calls-pixels 4096]]

--harness  07-rv32-count.py output (the prototype translation, sections inlined where GCC chooses): frame
           instructions per sample in both modes, their ratio, and the interpreter's own instructions per sample
           (the profile's interpreter and adapter groups). With --calls (03-agree.py output; its frame has
           --calls-pixels pixels, 64 x 64 by default), also section evaluations per sample and interpreter instructions per evaluation.
--kernel   08-kernel-digest.py output (CPU-KERNEL's kernel, which calls sections through its table, so compiled
           sections are separate functions): per target, the frame ratio, the compiled sections' instructions per
           sample (profile group "sections"), the interpreted sections' (interpreter plus adapter), and their ratio,
           the interpreter's slowdown on section code alone.
Prints Markdown tables."""
import json
import sys

args = sys.argv[1:]
out = args.pop(0)
harness, kernel, calls_file, pixels = [], None, None, 4096
while args:
    a = args.pop(0)
    if a == "--harness": harness.append(args.pop(0))
    elif a == "--kernel": kernel = args.pop(0)
    elif a == "--calls": calls_file = args.pop(0)
    elif a == "--calls-pixels": pixels = int(args.pop(0))
calls = {}
if calls_file:
    for l in open(calls_file):
        r = json.loads(l)
        calls.setdefault(r["preset"], {})[r["entry"]] = r["evaluations"] / (pixels * r.get("spp", 1))
res = {"harness": [], "kernel": []}
for spec in harness:
    label, path = spec.split("=", 1)
    rows = {}
    for l in open(path):
        r = json.loads(l)
        rows.setdefault(r["preset"], {})[r["mode"]] = r
    for p, m in rows.items():
        if "compiled" not in m or "vm" not in m:
            continue
        c, v = m["compiled"], m["vm"]
        interp = v["profilePerSample"].get("interpreter", 0) + v["profilePerSample"].get("adapters", 0)
        row = {"run": label, "preset": p, "frame": f"{c['width']}x{c['height']}", "compiled": c["perSample"], "vm": v["perSample"],
               "ratio": round(v["perSample"] / c["perSample"], 3), "interpreterPerSample": round(interp, 1)}
        if p in calls:
            ev = sum(calls[p].values())
            row["evaluationsPerSample"] = round(ev, 2)
            row["interpreterPerEvaluation"] = round(interp / ev, 1) if ev else None
        res["harness"].append(row)
if kernel:
    for l in open(kernel):
        r = json.loads(l)
        if not r["target"].startswith("rv32"):
            continue
        c, v = r["compiled"], r["vm"]
        sc = c["profilePerSample"].get("sections", 0)
        sv = v["profilePerSample"].get("interpreter", 0) + v["profilePerSample"].get("adapter", 0)
        res["kernel"].append({"target": r["target"], "arm": r["arm"], "preset": r["preset"], "frame": f"{r['width']}x{r['height']}",
                              "compiled": c["perSample"], "vm": v["perSample"], "ratio": r["ratio"], "sectionsCompiled": sc,
                              "sectionsVm": round(sv, 1), "sectionSlowdown": round(sv / sc, 2) if sc else None,
                              "sectionShareCompiled": round(sc / c["perSample"], 4), "digestEqual": r["digestEqual"]})
json.dump(res, open(out, "w"), indent=1)
f = lambda x: "-" if x is None else f"{x:,}"
if res["harness"]:
    print("| run | preset | frame | compiled | interpreted | ratio | interpreter per sample | evaluations per sample | interpreter per evaluation |")
    print("|---|---|---|---:|---:|---:|---:|---:|---:|")
    for r in res["harness"]:
        print(f"| {r['run']} | {r['preset']} | {r['frame']} | {f(r['compiled'])} | {f(r['vm'])} | {r['ratio']:.3f} | {f(r['interpreterPerSample'])} | "
              f"{f(r.get('evaluationsPerSample'))} | {f(r.get('interpreterPerEvaluation'))} |")
if res["kernel"]:
    print("\n| target | arm | preset | frame | compiled | interpreted | ratio | sections compiled | sections interpreted | slowdown | share compiled | digests |")
    print("|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|")
    for r in res["kernel"]:
        print(f"| {r['target']} | {r['arm']} | {r['preset']} | {r['frame']} | {f(r['compiled'])} | {f(r['vm'])} | {r['ratio']:.3f} | {f(r['sectionsCompiled'])} | "
              f"{f(r['sectionsVm'])} | {f(r['sectionSlowdown'])} | {100 * r['sectionShareCompiled']:.2f}% | {'equal' if r['digestEqual'] else 'differ'} |")
