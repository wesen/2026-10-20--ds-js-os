"""Give the independent author a private trace REPL in a fresh room."""
import argparse,json,re,subprocess,tempfile
from pathlib import Path
p=argparse.ArgumentParser()
p.add_argument("phase", choices=["oracle","article"])
p.add_argument("inputs",nargs="*",type=Path)
args=p.parse_args()
here=Path(__file__).resolve().parent;t=here.parent.parent
previous=next(t.parent.glob('PICOCALC-SIMD-LAB--*'))
room=Path(tempfile.mkdtemp(prefix="p4-shadow-validation-"+args.phase+"-"))
bridge=(previous/'scripts/physics/01-repl-bridge.py').read_text().replace(':3792',':3794').replace('physics','validator')
(room/'bridge.py').write_text(bridge)
(room/'mcp.json').write_text(json.dumps({'mcpServers':{'validator':{'command':'python3','args':[str(room/'bridge.py')]}}}))
intro="""You are the independent Opus High validation researcher in the PicoCalc shadow compiler laboratory. You have one local read-only JavaScript REPL (mcp__validator__eval). Use it once before completing the assignment. For the previous baseline try simd.executions("empty-row","empty-opening","scalar-lane-load").executions. This is contextual, it is not a new shadow measurement. Provide only intentional public deliverables, no hidden reasoning or private session transcript. Markdown headings, runnable JS, no analogies. """
if args.phase=="oracle":
    request="""Design and implement an additional self-contained reference-oracle fixture as standard JavaScript for testing a generic RV32 counted-loop register-homing pass; it caches a few mutable i32 local variables across branches and calls in callee-saved registers. The fixture must be your own substantive implementation. In code fence titled oracle put a compact ES module exporting const source (a Typed-language string with bounded loops, ordinary calls, at most six arguments, short circuit, i32 and buffer.charCodeAt/setCharCodeAt); export function cases() supplying cases with initial 16-bit words, logical capacity, integer arguments, expected signed result OR trap, and complete expected post-call words. Use enough locals to exceed a small register budget, loop-carrying state, multi-level call, observable store before a trap, early return/break if accepted, boundary values, skipped effect. Implement specification using Goja-compatible JS arithmetic with Math.imul and |0. Choose a stable simple record shape and one entry named probe with first argument buffer. Include host pseudocode usage in your separate notes. Supply three output blocks: ORACLE_BEGIN/ORACLE_END (just the JS file), LOG_BEGIN/LOG_END (a short public notebook of the commands you ran and external results), NOTES_BEGIN/NOTES_END (important failure scenarios or limitations)."""
else:
    request="""Write your independent validation article of 1100–1600 words for a new compiler student, and a concise public investigation diary covering your own two lab sessions, actual queries, independent oracle and file-level evidence. Explain why real chess, advanced=false, independent math oracle, evaluation/failure order and nested effects matter; separate host instructions and physical cycles; disclose weaknesses and exact physical candidate acceptance metrics. Use supplied results only. Include one concrete numerical example and mini diagram or pseudocode and real runnable JS data queries using provided cells. Output ARTICLE_BEGIN/ARTICLE_END and LOG_BEGIN/LOG_END blocks, plain Markdown within each. The receipt will credit you as researcher. Write an evidence-based engineering note; supply no private thought process."""
ctx=(t/'design-doc/04-validation-and-blind-chess-transfer.md').read_text()
for path in args.inputs:ctx+='\n## '+path.name+'\n'+path.read_text()
cmd=['claude','-p','--model','opus','--effort','high','--max-budget-usd','3.50','--setting-sources','','--settings','{"disableAllHooks":true}', '--disable-slash-commands','--strict-mcp-config','--mcp-config','./mcp.json','--tools','','--allowedTools','mcp__validator__eval','--permission-mode','dontAsk','--output-format','json']
proc=subprocess.run(cmd,input=intro+request+'\n\n'+ctx,text=True,cwd=room,capture_output=True,timeout=750)
if proc.returncode: raise RuntimeError(proc.stdout[-800:]+proc.stderr[-300:])
d=json.loads(proc.stdout);d=d[-1] if isinstance(d,list) else d
public=d['result'];(room/'result.txt').write_text(public)
target=t/'various/validation';target.mkdir(parents=True,exist_ok=True)
for name in (['ORACLE','LOG','NOTES'] if args.phase=='oracle' else ['ARTICLE','LOG']):
    mark=re.search(name+r'_BEGIN\s*(.*?)\s*'+name+r'_END',public,re.S)
    if not mark:raise ValueError('missing '+name+' in '+str(room/'result.txt'))
    body=mark[1].strip()
    if body.startswith('```'):body=body.split('\n',1)[1].rsplit('```',1)[0].rstrip()
    nameout='opus-'+args.phase+'-'+name.lower()
    if name=='ORACLE':(here/'opus-fixture.mjs').write_text(body+'\n')
    else:(target/(nameout+'.txt')).write_text(body+'\n')
assert (room/'validator-repl.jsonl').exists(), 'No independent researcher REPL receipt'
(target/('opus-'+args.phase+'-repl.jsonl')).write_bytes((room/'validator-repl.jsonl').read_bytes())
(target/('opus-'+args.phase+'-receipt.json')).write_text(json.dumps({'models':list(d.get('modelUsage',{})),'effort':'high','stop':d.get('stop_reason'),'turns':d.get('num_turns'),'phase':args.phase},indent=2)+'\n')
print(room,args.phase, 'success')
