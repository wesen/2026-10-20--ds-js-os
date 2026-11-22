"""Compare the Candela world's build records with the Node reference.

usage: python3 -I 04-compare.py NODE_REFERENCE.json LOG [LOG...] [--json OUT.json]

LOG holds the world's "CW {json}" lines (a host simulator run or a device UART log). For every scene built in
a log (the last record per scene wins), the WGSL digest, each array of pack({time:0}) (and of pack({time:2.5})
when measured), the 160 x 160 frame uniforms, the generated sections and the fixed kernel are compared with the
Node reference (02-node-reference.mjs). Prints one row per scene; exits 1 if any digest differs.
"""
import json
import sys

ARRAYS = ["U", "O", "LI", "BV", "SDs", "SDd"]


def records(paths):
    out = {}
    for p in paths:
        for raw in open(p, "rb").read().decode(errors="replace").splitlines():
            i = raw.find("CW {")
            if i < 0:
                continue
            try:
                rec = json.loads(raw[i + 3:])
            except ValueError:
                continue
            if rec.get("ev") == "build":
                out[rec["id"]] = rec
    return out


def compare(node, rec):
    diffs, checked = [], 0
    def same(what, a, b):
        nonlocal checked
        checked += 1
        if a != b:
            diffs.append(f"{what}: device {str(a)[:16]} node {str(b)[:16]}")
    if not rec.get("wgsl"):
        return checked, [f"no build output ({rec.get('error') or rec.get('refused')})"]
    same("wgsl", rec["wgsl"]["sha256"], node["wgsl"]["sha256"])
    for k in ARRAYS:
        same("pack0." + k, rec["pack0"][k]["sha256"], node["pack0"][k]["sha256"])
    if "packT" in rec:
        for k in ARRAYS:
            same("packT." + k, rec["packT"][k]["sha256"], node["packT"][k]["sha256"])
    same("frameU160", rec.get("frameU160"), node["frameU160"])
    same("sections", rec["sections"]["sha256"], node["sections"]["sha256"])
    return checked, diffs


def main():
    args = sys.argv[1:]
    out_json = None
    if "--json" in args:
        i = args.index("--json"); out_json = args[i + 1]; del args[i:i + 2]
    ref = json.load(open(args[0]))
    got = records(args[1:])
    rows, bad = [], 0
    for sid, node in ref["scenes"].items():
        rec = got.get(sid)
        if rec is None:
            rows.append({"id": sid, "status": "not built"}); print(f"{sid:6} not built"); continue
        n, diffs = compare(node, rec)
        fixed = rec.get("fixedKernel") == ref["fixedKernelSha256"]
        status = "equal" if not diffs and fixed else "DIFFERS"
        bad += status != "equal"
        rows.append({"id": sid, "status": status, "digests": n, "diffs": diffs, "fixedKernel": fixed,
                     "buildMs": rec.get("buildMs"), "pack0Ms": rec.get("pack0Ms"), "steps": rec.get("steps"),
                     "stackBytes": rec.get("stackBytes"), "peak": rec.get("heap", {}).get("peak"), "ok": rec.get("ok")})
        print(f"{sid:6} {status:8} {n:2} digests  build {rec.get('buildMs')} ms  pack0 {rec.get('pack0Ms')} ms  "
              f"stack {rec.get('stackBytes')}  peak {rec.get('heap', {}).get('peak')}  {'; '.join(diffs)}")
    built = [r for r in rows if r["status"] != "not built"]
    print(f"{sum(r['status'] == 'equal' for r in built)}/{len(built)} built scenes equal to Node; {len(rows) - len(built)} not built")
    if out_json:
        json.dump({"rows": rows}, open(out_json, "w"), indent=1)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
