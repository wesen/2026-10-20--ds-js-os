"""Arrange the researcher's public kernel notes and executed queries into the ticket's diary format."""
import argparse
import json
import subprocess
from pathlib import Path

ap = argparse.ArgumentParser(description=__doc__)
ap.add_argument("out",type=Path)
args = ap.parse_args()
ticket = Path(__file__).resolve().parents[2]
out = args.out.resolve()
out.mkdir(exist_ok=True,parents=True)
prompt = """Produce a technical engineering activity log about the published work at the end of this request.
Use three numbered steps, each with a short introductory paragraph, then headings Prompt Context, What I did,
Why, What worked, What didn't work, What I learned, What was tricky to build, What warrants a second pair of eyes,
Code review instructions, and Technical details. Refer only to externally observable events and design constraints.
Attribute the author of the initial kernel and technical chapter to the Opus High research lane and the host,
compiler syntax repairs and hardware runs to the operator; identify the 127/128 cutoff question as conditional if uncertain.
Include one exact input excerpt: "Use fixed-point particle integration as the first physics kernel."
Include the recorded failed query in the public query history with its correction.
The original public log described provisional assumptions; the adopted checked Typed number operations are explicit sign extension and saturation.
Limit to roughly 850 words. Use Markdown; no YAML. Supply the log artifact only."""
materials = [
    (ticket/"various/physics/opus-kernel-log.txt").read_text(),
    (ticket/"various/physics/opus-kernel-author.json").read_text(),
    (ticket/"various/physics/opus-simd-queries.jsonl").read_text(),
    (ticket/"various/physics/opus-chapter-author.json").read_text(),
]
result = subprocess.run(["claude","-p","--safe-mode","--model","opus","--effort","high",
    "--tools","","--output-format","json"],cwd=out,input=prompt+"\n"+"\n".join(materials),
    text=True,capture_output=True,check=True,timeout=1000)
raw = json.loads(result.stdout)
r = raw[-1] if isinstance(raw,list) else raw
if r["is_error"]: raise ValueError(r["result"][:350])
(out/"diary.md").write_text(r["result"]+"\n")
(out/"authorship.json").write_text(json.dumps({k:r[k] for k in ("session_id","duration_ms","is_error","stop_reason")}|
    {"model":list(r["modelUsage"]),"effort":"high"},indent=2)+"\n")
