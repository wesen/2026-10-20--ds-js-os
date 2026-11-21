"""Request a public technical chapter using only the released measurements and plan specification."""
import argparse,json,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[2]
ap=argparse.ArgumentParser();ap.add_argument('output',type=Path);args=ap.parse_args();d=args.output.resolve();d.mkdir(exist_ok=True,parents=True)
board=json.loads((root/'various/physics/board-results.json').read_text())
host=json.loads((root/'various/physics/host-summary.json').read_text())
input_data={'board':{k:v for k,v in board.items() if k!='rows'},'host':{k:v for k,v in host.items() if k!='workloads'},'selectedHost':[v for v in host['workloads'] if v['workload']=='particle-n128' or v['workload'].startswith('mesh128:')], 'repl':json.loads((root/'various/physics/workbook.json').read_text())}
prompt="""Author one technical textbook chapter (roughly 1,800–2,300 words) explaining the following published experiments for an intern studying embedded compilers and physics. A standalone Markdown chapter is the sole output. Use explicit definitions, a short diagram, pseudocode, physical paired statistics, worked example, rigor on denominators and experimental controls. No analogies. Teach particle saturation and layout, conversion amortization, contact dependencies and scheduling, same-order correctness, per-PC joins, board vs host units and reproduction from these scripts. State that these observations are kernel-level physical cycles per call with 12 buffer copies, 12 particle blocks and 14 contact blocks, and that the four matched specialized plans in the study are manually assigned. Additional automatic recognition is a separate section the operator may append once verified. Mention data source PICOCALC-SIMD-LAB scripts/physics and various/physics/ and physics 07-physics-workbook.py; cite Box2D SIMD Matters and Espressif PIE as appropriate. No personal log or discussion of how the article was composed. Begin directly with the Markdown H1. Use only the following public records."""
out=subprocess.run(['claude','-p','--safe-mode','--model','opus','--effort','high','--tools','','--output-format','json'],input=prompt+'\n'+(root/'design-doc/04-fixed-point-particle-layout-and-contact-order.md').read_text()+'\n'+json.dumps(input_data),cwd=d,capture_output=True,text=True,check=True,timeout=1200)
raw=json.loads(out.stdout);r=raw[-1] if isinstance(raw,list) else raw
if r['is_error']:raise RuntimeError(r['result'][:650])
(d/'article.md').write_text(r['result']+'\n')
(d/'authorship.json').write_text(json.dumps({k:r[k] for k in ('duration_ms','session_id','is_error','stop_reason')}|{'model':list(r['modelUsage']),'effort':'high'},indent=2)+'\n')
print('article words:',len(r['result'].split()))
