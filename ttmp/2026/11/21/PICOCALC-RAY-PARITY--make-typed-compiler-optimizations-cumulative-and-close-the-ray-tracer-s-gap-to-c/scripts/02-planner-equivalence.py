"""usage: python3 02-planner-equivalence.py PORT SESSION OUT.json  (session from 01 ... --baseline REV)"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from repl_client import Session
s = Session(int(sys.argv[1]), sys.argv[2])
s.eval(open(os.path.join(os.path.dirname(__file__), "02-planner-equivalence.js")).read())
rows = [s.eval(f"equivalence({i})") for i in range(s.eval("equivalenceInputs().length"))]
summary = {"inputs": len(rows), "compiledInputs": [r["name"] for r in rows if r["identical"]],
           "identical": sum(r["identical"] for r in rows), "errorsIdentical": sum(r["errorsIdentical"] for r in rows),
           "mismatches": [dict(r["mismatches"][i], name=r["name"]) for r in rows for i in range(len(r["mismatches"]))]}
json.dump({"summary": summary, "rows": rows}, open(sys.argv[3], "w"), indent=1)
print(json.dumps({k: (len(v) if k == "compiledInputs" else v) for k, v in summary.items()}))
