"""Commission one bounded Opus High investigation in its own persistent Goja session."""
from pathlib import Path
import argparse,json,subprocess,tempfile,sys
p=argparse.ArgumentParser();p.add_argument("phase",choices=["classifier","article"]);p.add_argument("room",type=Path);a=p.parse_args()
s=Path(__file__).resolve();t=s.parents[2];prev=next(t.parent.glob("PICOCALC-SIMD-LAB--*"))
room=a.room.resolve();room.mkdir(parents=True,exist_ok=True)
bridge=room/'bridge.py';bridge.write_text((prev/'scripts/physics/01-repl-bridge.py').read_text().replace(':3792',':3794').replace('physics','shadow'))
(room/'mcp.json').write_text(json.dumps({"mcpServers":{"shadow":{"command":"python3","args":[str(bridge)]}}}))
if a.phase=='classifier':
 prompt="""You are the Opus High physical measurement researcher for a compiler lab. The project compares 3-sphere floor shadow predicates compiled to ESP32-P4. You have one local read-only evidence REPL; run simd.executions('empty-row','empty-opening','scalar-lane-load').executions to verify it and log the result. Your substantive contribution is a small pure JS independent path classifier used as the experiment oracle. Given the Typed source below, write function classify(w,x,y) where w is an array of the first 33 unsigned work-buffer elements, indices start at zero (no length header). Return {result, path, counts}; result integer 0/1, path array of strings naming each visited sphere's outcome from ['x','y','miss','hit']; counts an object with those four keys. Use source short-circuit semantics; mathematically exact within small valid scene domain. Also implement first-path bins and sensible performance denominators in prose, and a public lab notebook of actions. Return a single JSON object with string fields js (only JavaScript code defining classify, no exports), notes, diary. 600 words maximum combined. No tools except the REPL."""
 prompt+='\n'+(Path.cwd()/'picocalc-os/worlds/raytrace/raytrace.typed').read_text().partition('function typedRayInShadow')[2].partition('function typedRaySphereScale')[0]
else:
 prompt="""Write a 1300-1800 word technical textbook chapter for a beginning compiler engineer about the attached physical experiment. Define the shadow test, projection, data layout, matching, cycles/call, semantic oracle, paired percentages and the limits of path cohorts. Use the attached concrete figures. Distinguish complete calls from per-sphere events, note the actual cold compiler cost and negative controls, explain exactly what code changed, and identify one future study. Include pseudocode, a worked number, REPL JS, file references and a detailed public diary of commands and measured results actually used. No analogies. Call mcp__shadow__eval with a few data points from the attached summary in JavaScript and check an actual paired percentage. Return a JSON object with string fields article and diary. Use a maximum of 2800 words total."""
 prompt+='\n'+(t/'various/device/article-input.json').read_text()
cmd=['claude','-p','--model','opus','--effort','high','--max-budget-usd','2.5','--output-format','json','--no-session-persistence','--strict-mcp-config','--mcp-config',str(room/'mcp.json'),'--tools','','--allowedTools','mcp__shadow__eval','--setting-sources','','--disable-slash-commands']
import os
proc=subprocess.run(cmd,cwd=room,input=prompt,text=True,capture_output=True,env={**os.environ,'MAX_THINKING_TOKENS':'2800','CLAUDE_CODE_MAX_OUTPUT_TOKENS':'8500'},timeout=480)
obj=json.loads(proc.stdout)
if isinstance(obj,list): obj=next(i for i in reversed(obj) if i.get('type')=='result')
public=obj.get('result','');(room/'response.txt').write_text(public)
start=public.find('{'); assert start>=0,(proc.returncode,public[:220]);payload=json.JSONDecoder().raw_decode(public[start:])[0]
dest=t/'various/device';(dest/(a.phase+'-receipt.json')).write_text(json.dumps({'model':list(obj.get('modelUsage',{})), 'effort':'high','stop':obj.get('stop_reason')},indent=2)+'\n')
assert (room/'shadow-repl.jsonl').exists()
(dest/(a.phase+'-repl.jsonl')).write_bytes((room/'shadow-repl.jsonl').read_bytes())
for key,val in payload.items(): (room/(key+'.txt')).write_text(val.strip()+'\n')
print(a.phase, {k:len(v) for k,v in payload.items()})
