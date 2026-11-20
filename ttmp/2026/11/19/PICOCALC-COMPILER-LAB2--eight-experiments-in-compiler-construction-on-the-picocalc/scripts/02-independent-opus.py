"""Ask separate Opus High researchers the design questions using only the printed project-approved prompts."""
import argparse
import concurrent.futures
import hashlib
import json
from pathlib import Path
import subprocess

QUESTIONS={
    "frontend": "A JS-written compiler on an ESP32-P4 executed by QuickJS spends about 2.45 seconds compiling Editor. A cursor scanner with reused token records saved about 300 ms. Propose a precise regex/cursor x fresh/reused trial and a lazy-token/source-span alternative. What lexical equivalence, startup confounders, and cold memory/time measurements matter?",
    "conditions": "A structured single-function compiler emits both WebAssembly and RV32. Propose destination-driven short-circuit lowering separately for condition and value uses with correct side effects and traps. Give a differentiating fixture, normalization boundary and a code-size model.",
    "operations": "A streaming typed compiler emits numeric function operations used by Wasm and RV32. Design a minimal transient typed operation for text reads and conditional comparisons, with a byte-equivalent recording control and direct code generation. Offer a simple composable representation, exact semantics and a falsifiable comparison.",
    "editor": "An incremental compiler caches source spans, typed dependency summaries, RV32 function fragments and symbolic call relocations. Design a physical experiment for an Editor with 120 functions and a bounded retained-fragment store. Specify body, signature, record-field edits; how to execute actual resulting native behavior, what to validate on eviction, and what time and memory to report.",
    "locals": "A single-pass RV32 compiler already stages operands and branches directly. Compare two per-function policies for frequently used locals in registers under loop pressure and across calls. Provide an ABI-safe lowering protocol, independent tests, and a disciplined way to value save/restore costs.",
    "bounds": "Design bounded per-use reasoning in a streaming compiler for 0<=i, i<end and end<=text.length with mutable locals and control joins. Specify safe transfer and invalidation including text identity, signed wrap and effects; compare current/direct/two-hop in a 64 KiB Editor workload with dynamic check counts.",
    "selection": "A compiler analyzes functions under a strict module-wide visit budget. Source-order admission recovered 720 words vs zero after reordering a single high-value function. Propose source-order, literal-only, benefit-per-cost policies, bounded storage, and a genuinely held-out generator and scoring protocol. Be explicit about opportunity scans, regressions and adversarial failure.",
    "await": "Design a narrow real typed async/await lowering for a handheld Editor Open request, suspension and native resumption. Include liveness, stable handles and cancellation, include old replies after cancellation and same-token scenarios, and qualification against a hand-written state machine. Recommend a minimal first implementation and measurable limits."
}
PREFIX="You are an independent compiler-construction researcher. Give a compact technical design review in 400-650 words, including one experiment where your preferred approach could lose. The team is willing to trade heap in either direction for performance or simplicity. No analogies. Only the following question and public algorithm knowledge are available.\n\n"


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("out",type=Path)
    parser.add_argument("--workers",type=int,default=3)
    args=parser.parse_args()
    out=args.out.resolve()
    out.mkdir(parents=True,exist_ok=True)
    empty=out/"empty"
    empty.mkdir(exist_ok=True)
    def review(key):
        target=out/(key+".json")
        if target.exists(): return
        prompt=PREFIX+QUESTIONS[key]
        cmd=["claude","-p","--model","opus","--effort","high","--tools","","--disable-slash-commands",
             "--setting-sources","","--strict-mcp-config","--no-session-persistence","--output-format","json"]
        proc=subprocess.run(cmd,input=prompt,text=True,capture_output=True,cwd=empty,timeout=480)
        if proc.returncode:
            raise RuntimeError(f"{key}: Claude Code exited {proc.returncode}: {proc.stderr[-450:]} {proc.stdout[-250:]}")
        events=json.loads(proc.stdout)
        events=events if isinstance(events,list) else [events]
        result=next(e for e in reversed(events) if e.get("type")=="result")
        if result.get("is_error") or not result.get("result"): raise ValueError(key)
        record={"study":key,"model":list(result.get("modelUsage",{})),"effort":"high",
                "prompt_sha256":hashlib.sha256(prompt.encode()).hexdigest(),"review":result["result"]}
        target.write_text(json.dumps(record,indent=2)+"\n")
        print(key,record["model"],flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        list(pool.map(review,QUESTIONS))


if __name__=="__main__":
    main()
