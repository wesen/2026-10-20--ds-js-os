"""Commission the independent high-effort lexical representation study using an empty external worktree."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

TICKET=Path(__file__).resolve().parents[1]


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase",choices=["design","report"])
    parser.add_argument("scratch",type=Path)
    parser.add_argument("--evidence",type=Path)
    args=parser.parse_args()
    args.scratch.mkdir(parents=True,exist_ok=True)
    out=TICKET/"various"/("independent-"+args.phase+".json")
    if out.exists(): raise FileExistsError(out)
    prompt="""You are an independent compiler researcher preparing an intern-level technical study of lexical indexing for an embedded JavaScript-hosted compiler. The physical asynchronous Editor cold compilation measured 3.817 s in the first trial versus a median of 2.646 s for its previous source and compiler. Target <=2.910 s. Original and compiler-generated typed source are distinct. A native scanner indexes each immutable source with uint32 occurrence records [UTF16 start,end,symbol,matching close brace row +1] and a spelling table [first start,end,kind]. Repeated equal spellings can share a symbol; bindings and types cannot. Scope indices to one compilation and keep JS diagnostics identical. The compiler has a 4 MiB QuickJS allocation limit. An optional native implementation can decline unsupported input; malformed, bounded and Unicode cases need the reference semantics. Use precise textbook prose without analogy. Distinguish measured data, hypotheses and limits. Include an investigation diary after your article: prompt context, interpretation, intent, what you did, why, what worked/did not, what you learned, tricky parts, independent review, next steps, review instructions, technical details. Do not claim independent hardware operation."""
    if args.phase=="design":
        prompt+=" Provide a compact pre-implementation design review, with the fastest falsification tests and a fair time/memory comparison."
    else:
        prompt+=" Write a self-contained project article (900–1400 words, then diary) using only the following verified measurements. Accurately use the provided production selection and hardware status.\n"+args.evidence.read_text()
    proc=subprocess.run(["claude","-p","--model","claude-opus-4-6","--effort","high","--tools","",
                         "--disable-slash-commands","--setting-sources","","--strict-mcp-config","--no-session-persistence",
                         "--output-format","json"],input=prompt,text=True,capture_output=True,cwd=args.scratch,timeout=900,check=True)
    doc=json.loads(proc.stdout)
    if isinstance(doc,list): doc=next(r for r in reversed(doc) if r.get("type")=="result")
    if doc.get("is_error") or not doc.get("result"): raise RuntimeError(doc.get("result","missing result")[:300])
    models=list(doc.get("modelUsage",{}))
    if not any("opus" in model for model in models): raise ValueError(models)
    out.write_text(json.dumps(dict(model=models,effort="high",prompt_sha256=hashlib.sha256(prompt.encode()).hexdigest(),text=doc["result"]),indent=2)+"\n")


if __name__=="__main__": main()
