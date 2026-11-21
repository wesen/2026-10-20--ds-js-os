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
    docs = [repo/"cmd/trace-repl/README.md", *args.inputs]
    prompt = """Write a technical measurement review of a student compiler laboratory for publication to the project vault. You have read-only access to the local SIMD data via mcp__review__eval. Please run a short query to verify the scalar-lane-load execution counts for the pie, empty and full images. Example: ["pie","empty","full"].map(k => simd.executions(k+"-row",k+"-opening","scalar-lane-load").executions). Use the supplied tables to review the default complete frame, whole-row cycles, the particle/contact controls, and the blind collision selector. Explain percentage denominators and distinguish a tested compiler choice from an outstanding inference. Give a concrete follow-up experiment. Intended audience: beginning compiler students. Use a descriptive title and about 1000-1500 words, no analogies. Return valid JSON with two string fields: review (the Markdown article) and diary (a public lab notebook containing only the API calls you performed, the measurements you checked and any tool failures)."""
for doc in docs: prompt+="\n\n## "+doc.name+"\n"+doc.read_text()
cmd=["claude","-p","--model","opus","--effort","high","--output-format","json","--no-session-persistence","--strict-mcp-config","--mcp-config",str(room/"mcp.json"),"--tools","","--allowedTools","mcp__review__eval","--setting-sources","","--disable-slash-commands"]
proc=subprocess.run(cmd,input=prompt,text=True,cwd=room,capture_output=True,timeout=1500)
if proc.returncode: raise SystemExit(proc.stderr[-500:]+proc.stdout[-500:])
response=json.loads(proc.stdout)
if isinstance(response,list): response=next(item for item in reversed(response) if item.get("type")=="result")
out=response.get("result","").strip()
(room/"public-result.txt").write_text(out)
if not out: raise SystemExit(str({k:response.get(k) for k in ["subtype","is_error","stop_reason"]}))
# A result may include a short preface and an explanatory trailer around the JSON.
fence = chr(96)*3 + "json" + chr(10)
if fence in out: out = out.split(fence,1)[1]
elif out.startswith(chr(96)*3): out = out.split(chr(10),1)[1]
obj,_ = json.JSONDecoder().raw_decode(out.lstrip())
if not (room/"review-repl.jsonl").exists(): raise SystemExit("no independent live REPL receipt")
target=t/"various/review"
for key in ("review","diary"): (target/(args.phase+"-"+key+".txt")).write_text(obj[key].rstrip()+"\n")
(target/(args.phase+"-repl.jsonl")).write_bytes((room/"review-repl.jsonl").read_bytes())
(target/(args.phase+"-receipt.json")).write_text(json.dumps({"model":list(response.get("modelUsage",{})),"effort":"high","inputs":[s.name for s in docs],"stop":response.get("stop_reason")},indent=2)+"\n")
