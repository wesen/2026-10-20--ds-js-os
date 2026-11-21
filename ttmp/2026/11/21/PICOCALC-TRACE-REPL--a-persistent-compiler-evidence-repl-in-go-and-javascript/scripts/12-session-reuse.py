#!/usr/bin/env python3
"""Measure local HTTP round trips for one query, a repeated plan, and a saved result."""
import argparse
import json
from pathlib import Path
from statistics import median
from time import perf_counter_ns
from urllib.request import Request, urlopen

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--addr", default="http://127.0.0.1:3791")
    p.add_argument("--out", type=Path)
    args = p.parse_args()
    def request(method, path, body=None):
        payload = json.dumps(body).encode() if body is not None else None
        req = Request(args.addr+path, method=method, data=payload, headers={"Content-Type":"application/json"})
        with urlopen(req, timeout=25) as resp:
            raw = resp.read()
        return json.loads(raw) if raw else {}
    root = "/sessions/" + request("POST","/sessions")["id"]
    def eval_(source):
        t = perf_counter_ns()
        r = request("POST", root+"/eval", {"source":source})
        elapsed = (perf_counter_ns() - t) / 1e6
        if not r.get("ok"):
            raise ValueError(r)
        return r.get("value"), elapsed
    try:
        eval_("""const row = a.variant("checked").function("row");
                 const middle = row.timeline("middle");
                 const loads = q.ir.instructions().opcode("load").resultType("i32").pointer(row.argument(0)).count();
                 const firstDrop = middle.measure(loads).changes().where(d => d.status === "known" && d.delta < 0).first();
                 undefined""")
        first, first_ms = eval_("const saved = q.run(firstDrop); saved")
        if not first:
            raise ValueError("empty first result")
        samples = {"repeatPlanMs":[], "savedBindingMs":[]}
        for repeat in range(7):
            operations = [("repeatPlanMs","q.run(firstDrop)"), ("savedBindingMs","saved")]
            if repeat % 2:
                operations.reverse()
            for name, expr in operations:
                data, ms = eval_(expr)
                if data != first:
                    raise ValueError("evidence changed on "+expr)
                samples[name].append(ms)
        result={"metric":"host HTTP round trip, ms including identical serialized witness",
                "archiveState":"shared process cache may already be warm; only the session was fresh",
                "firstEvaluationMs":first_ms,"samples":samples,
                "medianMs":{key:median(x) for key,x in samples.items()},"witness":first}
        out=json.dumps(result,indent=2)+"\n"
        if args.out: args.out.write_text(out)
        else: print(out,end="")
    finally:
        request("DELETE",root)

if __name__=="__main__":
    main()
