"""Commission an independent Opus reviewer in a private directory and REPL session."""
import argparse, json, subprocess, tempfile
from pathlib import Path

t=Path(__file__).resolve().parents[2]
repo=Path(subprocess.check_output(["git","rev-parse","--show-toplevel"],text=True).strip())
p=argparse.ArgumentParser()
p.add_argument("phase",choices=["protocol","outcome"])
p.add_argument("inputs",nargs="*",type=Path)
args=p.parse_args()
room=Path(tempfile.mkdtemp(prefix="p4-packet-review-"))
bridge=room/"bridge.py"
bridge.write_text((t/"scripts/physics/01-repl-bridge.py").read_text().replace("physics","review").replace(":3792",":3794" if args.phase=="outcome" else ":3792"))
(room/"mcp.json").write_text(json.dumps({"mcpServers":{"review":{"command":"python3","args":[str(bridge)]}}}))
docs=[repo/"cmd/trace-repl/README.md",t/"design-doc/05-frozen-held-out-protocol.md",t/"scripts/director/selector.js",next(t.parent.glob("PICOCALC-PIE-LOOPS*/analysis/01-*")),Path.home()/".codex/skills/diary/references/investigation-entry.md",*args.inputs]
prompt="""Independent scientific review of the PicoCalc SIMD study. You have your own local session via mcp__review__eval. Use it to check original board comparisons. Assess whether proposed choices and measurements identify compiler effects. At protocol phase identify concrete pre-measurement controls and failure conditions for six studies: hand ray row, packet boundary, range/trap safety, particle layout, conflict-free contacts, and held-out regret/cold compile. At outcome phase audit supplied evidence, units, omissions and engineering claims. Write markdown review and your own investigation diary using supplied format. Cite actual observations, distinguish recommendations, no analogies. Return a JSON object with string fields review and diary only."""
if args.phase == "outcome":
    prompt += """ Your review will be published as an independent textbook-style engineering article for beginners (about 1100-1900 words). Give it a title, explain compiler fundamentals, use a worked numerical example, review causes vs associations, independence, measured benefits and counterexamples. Use the real simd API in your isolated MCP session to query simd.executions('pie-row','pie-opening','scalar-lane-load') and related image-matched results; API help is available. Physical comparisons are supplied separately. The earlier production trial verifies each treatment against the same expected memory after timing. This lab uses independent Wasm golden outputs and several granularities of validation (row bytes or frame plane hashes). Review those precisely. Include your own chronological public work log in the diary field with commands, outcomes and verification. Write only the two specified JSON fields."""
for doc in docs: prompt+="\n\n## "+doc.name+"\n"+doc.read_text()
cmd=["claude","-p","--model","opus","--effort","high","--output-format","json","--no-session-persistence","--strict-mcp-config","--mcp-config",str(room/"mcp.json"),"--tools","","--allowedTools","mcp__review__eval","--setting-sources","","--disable-slash-commands"]
proc=subprocess.run(cmd,input=prompt,text=True,cwd=room,capture_output=True,timeout=1500)
if proc.returncode: raise SystemExit(proc.stderr[-500:]+proc.stdout[-500:])
response=json.loads(proc.stdout)
if isinstance(response,list): response=next(item for item in reversed(response) if item.get("type")=="result")
out=response.get("result","").strip()
(room/"public-result.txt").write_text(out)
if not out: raise SystemExit(str({k:response.get(k) for k in ["subtype","is_error","stop_reason"]}))
if out.startswith("```"): out=out.split("\n",1)[1].rsplit("```",1)[0]
obj=json.loads(out)
if not (room/"review-repl.jsonl").exists(): raise SystemExit("no independent live REPL receipt")
target=t/"various/review"
for key in ("review","diary"): (target/(args.phase+"-"+key+".txt")).write_text(obj[key].rstrip()+"\n")
(target/(args.phase+"-repl.jsonl")).write_bytes((room/"review-repl.jsonl").read_bytes())
(target/(args.phase+"-receipt.json")).write_text(json.dumps({"model":list(response.get("modelUsage",{})),"effort":"high","inputs":[s.name for s in docs],"stop":response.get("stop_reason")},indent=2)+"\n")
