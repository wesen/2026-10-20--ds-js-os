"""Commission a bounded Opus High technical contribution with a fresh local JS session."""
import argparse
import json
import subprocess
import tempfile
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('task',choices=['design','implementation','article','introduction']);args=p.parse_args()
ticket=Path(__file__).resolve().parents[2];root=ticket.parents[4]
prior=next(ticket.parent.glob('PICOCALC-SIMD-LAB--*'))
previous=next(ticket.parent.glob('PICOCALC-SCALAR-BREAKDOWN--*'))
lab=Path(tempfile.mkdtemp(prefix='p4-shadow-'+args.task+'-'))
bridge=(prior/'scripts/physics/01-repl-bridge.py').read_text().replace('physics','compiler').replace('3792','3794')
# Each commission receives the original forecast in its own private sandbox.
fresh = {}
if args.task in ('article','introduction'):
    for arm in ('baseline','shadow','general'):
        fresh[arm] = json.loads((ticket/'various/compile'/(arm + '.json')).read_text())

seed = "const measured=" + (previous/'various/compiler/shadow-forecast.json').read_text() + "; const opening=" + json.dumps(fresh) + "; undefined"
bridge = bridge.replace('    try:', '    req("POST",session+"/eval",{"source":' + repr(seed) + '})\n    try:', 1)
(lab/'bridge.py').write_text(bridge)
(lab/'mcp.json').write_text(json.dumps({'mcpServers':{'compile':{'command':'python3','args':[str(lab/'bridge.py')]}}}))
files=[root/'picocalc-os/compiler/typed-rv32.js',previous/'various/compiler/shadow-forecast.json',Path.home()/'.codex/skills/diary/references/investigation-entry.md']
if args.task=='design':
    prompt="""You are the Opus High compiler implementation researcher. Supply an independent substantive contribution to a Typed RV32 scalar-local register promotion pass. In your local private JS session, exercise measured.observed and estimate the upper bound on removable stack loads; comment on moves and saves. Design an executable JS static local scoring function for typedWasm.decodeNumericOperations(fn.code) where array items have opcode and operands. Explain ABI/reserved registers, streaming budget, correctness and execution controls on held-out code. Write working JS in code, public investigation log strictly describing actions performed, and design in Markdown. Return JSON {code:string, diary:string, design:string}. Limit response to 1300 words."""
elif args.task=='implementation':
    prompt="""Fresh replay found 74,226 calls from the shadow function into a unary signed absolute-value helper and 691,244 total instructions in the helper. GCC inlines absolute value as srai/xor/sub. As our only researcher, implement a smaller candidate before pursuing register homes. Return working mergeable JS for matchGuardedReturn(fn) and for emitGuardedReturn(FunctionCode, summary), with no app names or offsets. Normalized tape for abs = [32,0,65,0,72,4,64,65,0,32,0,107,15,11,32,0,11]. Broaden to any signed/equality guard x rel literal and taken action return -x or return literal, with fallthrough return x. Enforce one i32 parameter, i32 result, no locals; exact end-to-end tape. Use RISC-V branch around action, preserve wrap at INT_MIN, comparison signedness/equality, precise effects. Use the REPL for an executable truth-table check of all comparisons. Integration: summarize each emitted body (streaming), duplicate only tiny certified effects in callers; ordinary fallback for unresolved functions including forward declarations, imported functions must never be treated as defined helpers. Explain avoiding forged import descriptor fields. Include public investigation diary. Return JSON {code:string,diary:string,design:string}, 1100 word cap."""
    files.append(ticket/'various/compile/baseline.json')
elif args.task=='introduction':
    prompt="""Write the opening 550–700 words of your textbook chapter for students new to raytracing and compiler design. Your research initiated the alternative register-home scoring prototype; the compiler coordinator integrated guarded-return lowering. Focus on the default ray/shadow loop, what a source helper and stack register are, your register-home experiment, and why the evidence made the group prioritize the smaller pure helper rule. Explain how the proof and two-word lowering work in a few sentences. The chapter already has your results/JS/diary, so do not repeat them. Return only Markdown prose with a title and descriptive headings. No JSON and no analogies. You can verify fresh results in your private JS session under opening, and historical counts under measured."""
    files=[ticket/'various/compile/opus-design-design.txt',ticket/'various/compile/opus-design-diary.txt',
        ticket/'various/compile/baseline.json',ticket/'various/compile/call-sites.json']
else:
    prompt="""Write the participating researcher's chapter. You are the person who implemented/tested the register-homes scorer prototype described in the attached design notes. The compiler coordinator implemented and tested guarded returns; the director operates the board. Explain your alternative, why the group chose arithmetic call substitution first, the implementation and its verified effects. Your audience starts with little compiler background; use a 1200–1600 word technical textbook style, logical paragraphs, one small diagram, no analogies. Clearly distinguish dynamic instructions from time and historical denoms from the current control. In your fresh trace REPL sandbox, the bound object opening contains {baseline,shadow,general}. Use it to recompute instruction reduction, attribution and code sizes, and include one exact runnable cell referencing opening. The prior forecast is bound as measured. Match the archived opening fixture and cite relative artifact paths. Do not assume the board has finished. Include your public diary entry outlining your own actions and findings. Return valid JSON {article:string,diary:string}."""
    files=[ticket/'various/compile'/name for name in ['opus-design-design.txt','opus-design-diary.txt','gcc-source.json','gcc-in-shadow.gimple']]
    files.extend([ticket/'reference/03-compiler-investigation-diary.md',root/'picocalc-os/compiler/typed-rv32.js'])
    for path in sorted((ticket/'various/compile').glob('*.json')):
        if path.stat().st_size < 35000 and 'receipt' not in path.name and path not in files:files.append(path)
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
result=ticket/'various/compile'
(result/('opus-'+args.task+'-receipt.json')).write_text(json.dumps({'model':list(response.get('modelUsage',{})),'effort':'high','stop':response.get('stop_reason'),'versionedInputs':[p.name for p in files]},indent=2)+'\n')
if (lab/'compiler-repl.jsonl').exists():
    (result/('opus-'+args.task+'-repl.jsonl')).write_bytes((lab/'compiler-repl.jsonl').read_bytes())
if args.task=='introduction':
    (result/'opus-introduction-article.txt').write_text(s.strip()+'\n')
    print('Archived',args.task,'from',lab)
    raise SystemExit
start=s.find('{')
if start<0:raise ValueError(str(lab))
result=ticket/'various/compile'
try:
    obj,_=json.JSONDecoder().raw_decode(s[start:])
except json.JSONDecodeError:
    # Claude may return a resumed tail of its public JSON. Recover only complete
    # sections that remain, preserving attribution and marking the missing part.
    if args.task == 'article' and '## 6. Verified effects' in s:
        obj = json.loads('{"article":"' + s[s.index('## 6. Verified effects'):])
        (result/'opus-article-status.txt').write_text('Opening sections missing from returned CLI response. Recovered results and investigator diary.\n')
    else:
        (result/('opus-'+args.task+'-status.txt')).write_text('No structured artifact was returned.\n'+s[:700]+'\n')
        raise
for key,val in obj.items(): (result/('opus-'+args.task+'-'+key+'.txt')).write_text(val.strip()+'\n')
(result/('opus-'+args.task+'-repl.jsonl')).write_bytes((lab/'compiler-repl.jsonl').read_bytes())
(result/('opus-'+args.task+'-receipt.json')).write_text(json.dumps({'model':list(response.get('modelUsage',{})),'effort':'high','stop':response.get('stop_reason'),'versionedInputs':[p.name for p in files]},indent=2)+'\n')
print('Archived',args.task,'from',lab)
