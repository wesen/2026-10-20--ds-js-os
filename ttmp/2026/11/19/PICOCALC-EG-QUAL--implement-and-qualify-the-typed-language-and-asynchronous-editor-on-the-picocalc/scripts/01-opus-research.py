"""Commission three independent Opus High studies and their evidence-based final articles."""
import argparse
import concurrent.futures
import hashlib
import json
from pathlib import Path
import subprocess

TICKET = Path(__file__).resolve().parents[1]
QUESTIONS = {
    "language": "Design forward declarations in a streaming two-target compiler, a cycle check, short-circuit structured control and exhaustive enums plus erased integer units. Identify two failure cases and how to test cold overhead without conflating it with output execution.",
    "continuations": "Design a resumable compiler for a typed handheld language with a control-flow graph, ambient event-time buffers, lexical shadowing, nonrecursive calls between asynchronous functions, cancellation and immediate failed starts. Describe liveness, lowering and subtle diagnostic fixtures.",
    "editor": "Design a matched native and Wasm experiment for a resumable text editor. Compare a hand-written state machine with generated start/resume, measuring time through an entire search across a 64 KiB text, including yields, and separate compiler cost, guest work and frame storage. Specify observable completion signals for miss, early and late hits.",
}
FORMAT = """You are the named independent researcher on this project. Respond in Markdown, using textbook prose without analogies for a new compiler engineer. Include a detailed numbered investigation diary below the analysis, covering prompt context, interpretation, inferred intent, what you did, why, what worked, what did not, what you learned, tricky parts, independent review, next steps, review instructions and technical details. Distinguish predictions from measurements. Do not claim to have run tools. This review is supplied to the implementation team and archived. """
def research(lane, phase, evidence, scratch, model):
    directory = TICKET / "various" / "opus"
    directory.mkdir(parents=True, exist_ok=True)
    out = directory / (lane + "-" + phase + ".json")
    if out.exists():
        return
    prompt = FORMAT + QUESTIONS[lane]
    if phase == "design":
        prompt += "\nPrepare a 500–750 word design for the study, including pseudocode and measurable failure criteria."
    else:
        proposal = json.loads((directory / (lane + "-design.json")).read_text())["text"]
        prompt += "\nYour initial design:\n" + proposal + "\nVerified measurements supplied by the implementation team:\n" + (evidence / (lane + ".md")).read_text()
        prompt += "\nAuthor your own standalone pedagogical project report, 900–1500 words, with the diary after it. Explain actual results, limitations and precise implementation references."
    result = subprocess.run(["claude","-p","--model",model,"--effort","high","--tools","","--disable-slash-commands","--setting-sources","","--strict-mcp-config","--no-session-persistence","--output-format","json"],input=prompt,cwd=scratch,text=True,capture_output=True,timeout=900)
    events=json.loads(result.stdout)
    if not isinstance(events,list): events=[events]
    event=next(x for x in reversed(events) if x.get("type")=="result")
    if result.returncode or event.get("is_error"):
        raise RuntimeError(f"{lane}: {event.get('result', 'no CLI result')[:420]}")
    models=list(event.get("modelUsage",{}))
    if not any("opus" in s for s in models) or event.get("is_error") or not event.get("result"):
        raise ValueError((lane,models))
    out.write_text(json.dumps(dict(lane=lane,phase=phase,model=models,effort="high",prompt_sha256=hashlib.sha256(prompt.encode()).hexdigest(),text=event["result"]),indent=2)+"\n")
    print(lane,phase,models,flush=True)

if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("phase",choices=["design","report"]);p.add_argument("scratch",type=Path);p.add_argument("--evidence",type=Path)
    p.add_argument("--model",default="opus")
    p.add_argument("--lane", choices=QUESTIONS, action="append", help="commission one lane when its evidence is ready")
    a=p.parse_args();a.scratch.mkdir(parents=True,exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(lambda lane:research(lane,a.phase,a.evidence,a.scratch,a.model),a.lane or QUESTIONS))
