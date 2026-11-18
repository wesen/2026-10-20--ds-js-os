"""Summarize completed alternating stage-1 candidate trials (round zero warms each executable)."""
import argparse
import hashlib
import json
from pathlib import Path
import re
from statistics import median

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("out",type=Path)
parser.add_argument("case",choices=["memo","join","defer","guard"])
parser.add_argument("--case-dir", type=Path, help="candidate receipts when stored outside OUT")
parser.add_argument("--world", default="agenda")
parser.add_argument("--candidate-exe", type=Path)
args=parser.parse_args()
out=args.out
case=args.case_dir or out/args.case
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
reference=sha(out/f"{args.world}.ref")
report=dict(case=args.case,world=args.world,heap_mib=8,reference_sha256=reference,variants={})
for name, exe in [("baseline",out/"stage1-measured"),("candidate",args.candidate_exe or case/"stage1")]:
    assert sha(case/f"{name}.ir")==reference
    runs=[]
    for ordinal in range(4):
        log=(case/f"{name}-{ordinal}.stats").read_text()
        front,gc,slide=map(int,re.search(r"frontend_us=(\d+) gc_us=(\d+) slide_bytes=(\d+)",log).groups())
        count,surv,live=map(int,re.search(r"(\d+) collections, (\d+) bytes copied, heap now 8388608 bytes, most live (\d+) bytes",log).groups())
        runs.append(dict(ordinal=ordinal,warmup=ordinal==0,frontend_us=front,gc_us=gc,slide_bytes=slide,
                         collections=count,survivor_bytes=surv,live_peak_bytes=live))
    report["variants"][name]=dict(executable_sha256=sha(exe),runs=runs,median_us=median(r["frontend_us"] for r in runs[1:]))
a,b=(report["variants"][n]["median_us"] for n in ["baseline","candidate"])
report["median_change_percent"]=100*(b/a-1)
print(json.dumps(report,indent=2))
