"""Commission a bounded Opus High technical contribution with a fresh local JS session."""
import argparse
import json
import subprocess
import tempfile
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('task',choices=['design','implementation','article']);args=p.parse_args()
ticket=Path(__file__).resolve().parents[2];root=ticket.parents[4]
prior=next(ticket.parent.glob('PICOCALC-SIMD-LAB--*'))
previous=next(ticket.parent.glob('PICOCALC-SCALAR-BREAKDOWN--*'))
lab=Path(tempfile.mkdtemp(prefix='p4-shadow-'+args.task+'-'))
bridge=(prior/'scripts/physics/01-repl-bridge.py').read_text().replace('physics','compiler').replace('3792','3794')
# Populate only the research data this commission needs.
bridge=bridge.replace('    try:', '    req("POST",session+"/eval",{"source":"const measured="+'+repr((previous/'various/compiler/shadow-forecast.json').read_text())+'+"; undefined"})\n    try:',1)
(lab/'bridge.py').write_text(bridge)
(lab/'mcp.json').write_text(json.dumps({'mcpServers':{'compile':{'command':'python3','args':[str(lab/'bridge.py')]}}}))
files=[root/'picocalc-os/compiler/typed-rv32.js',previous/'various/compiler/shadow-forecast.json',Path.home()/'.codex/skills/diary/references/investigation-entry.md']
if args.task=='design':
    prompt="""You are the Opus High compiler implementation researcher. Supply an independent substantive contribution to a Typed RV32 scalar-local register promotion pass. In your local private JS session, exercise measured.observed and estimate the upper bound on removable stack loads; comment on moves and saves. Design an executable JS static local scoring function for typedWasm.decodeNumericOperations(fn.code) where array items have opcode and operands. Explain ABI/reserved registers, streaming budget, correctness and execution controls on held-out code. Write working JS in code, public investigation log strictly describing actions performed, and design in Markdown. Return JSON {code:string, diary:string, design:string}. Limit response to 1300 words."""
elif args.task=='implementation':
    prompt="""Fresh replay found 74,226 calls from the shadow function into a unary signed absolute-value helper and 691,244 total instructions in the helper. GCC inlines absolute value as srai/xor/sub. As our only researcher, implement a smaller candidate before pursuing register homes. Return working mergeable JS for matchGuardedReturn(fn) and for emitGuardedReturn(FunctionCode, summary), with no app names or offsets. Normalized tape for abs = [32,0,65,0,72,4,64,65,0,32,0,107,15,11,32,0,11]. Broaden to any signed/equality guard x rel literal and taken action return -x or return literal, with fallthrough return x. Enforce one i32 parameter, i32 result, no locals; exact end-to-end tape. Use RISC-V branch around action, preserve wrap at INT_MIN, comparison signedness/equality, precise effects. Use the REPL for an executable truth-table check of all comparisons. Integration: summarize each emitted body (streaming), duplicate only tiny certified effects in callers; ordinary fallback for unresolved functions including forward declarations, imported functions must never be treated as defined helpers. Explain avoiding forged import descriptor fields. Include public investigation diary. Return JSON {code:string,diary:string,design:string}, 1100 word cap."""
    files.append(ticket/'various/compile/baseline.json')
else:
    prompt="""Author a substantive 1100–1600 word textbook-style technical report on this compiler experiment for new students. Access your separate live JS sandbox using mcp__compile__eval to check the prior bounds/stack observations. Explain the measured results precisely; distinguish shadow-only whole-frame vs general mode and checks from register homes. Include a worked machine-code example, a runnable JS cell, a limitation and a concrete next experiment. Provide your public dated investigation diary with commands/actions/results. No analogies. Return JSON {article:string,diary:string}."""
    for path in sorted((ticket/'various/compile').glob('*.json')):
        if path.stat().st_size<85000 and 'receipt' not in path.name:files.append(path)
    for pattern in ['*summary*.json','*result*.json','*score*.json']:
        for path in (ticket/'various/device').glob(pattern):
            if path.stat().st_size<35000:files.append(path)
    if (ticket/'various/compile/outcome.txt').exists():files.append(ticket/'various/compile/outcome.txt')
for path in files: prompt+='\n\n## '+path.name+'\n'+path.read_text()
cmd=['claude','-p','--model','opus','--effort','high','--max-budget-usd','4.5','--output-format','json','--no-session-persistence','--strict-mcp-config','--mcp-config',str(lab/'mcp.json'),'--tools','','--allowedTools','mcp__compile__eval','--setting-sources','','--disable-slash-commands']
res=subprocess.run(cmd,input=prompt,text=True,cwd=lab,capture_output=True,timeout=450,
 env=dict(__import__('os').environ,CLAUDE_CODE_MAX_OUTPUT_TOKENS='8000',MAX_THINKING_TOKENS='3500'))
if res.returncode: raise SystemExit((res.stderr or res.stdout)[-800:])
response=json.loads(res.stdout)
if isinstance(response,list): response=next(e for e in reversed(response) if e.get('type')=='result')
s=response['result']; (lab/'public-result.txt').write_text(s)
start=s.find('{')
if start<0:raise ValueError(str(lab))
obj,_=json.JSONDecoder().raw_decode(s[start:]);result=ticket/'various/compile'
for key,val in obj.items(): (result/('opus-'+args.task+'-'+key+'.txt')).write_text(val.strip()+'\n')
(result/('opus-'+args.task+'-repl.jsonl')).write_bytes((lab/'compiler-repl.jsonl').read_bytes())
(result/('opus-'+args.task+'-receipt.json')).write_text(json.dumps({'model':list(response.get('modelUsage',{})),'effort':'high','stop':response.get('stop_reason'),'versionedInputs':[p.name for p in files]},indent=2)+'\n')
print('Archived',args.task,'from',lab)
