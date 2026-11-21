"""Commission the physics researcher with sensor records and only a local JS eval tool."""
import argparse
import json
from pathlib import Path
import subprocess

HERE=Path(__file__).resolve().parent
T=HERE.parent.parent
def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("workdir",type=Path)
    args=ap.parse_args(); d=args.workdir.resolve();d.mkdir(exist_ok=True,parents=True)
    host=json.loads((T/"various/physics/host-summary.json").read_text())
    board=json.loads((T/"various/physics/board-results.json").read_text())
    summary={"host":{k:v for k,v in host.items() if k!="workloads"},
        "host128":[r for r in host["workloads"] if r["workload"]=="particle-n128" or r["workload"].startswith("mesh128:")],
        "board":{k:v for k,v in board.items() if k!="rows"},
        "qualification":{"rows":len(board["rows"]),"individualCalls":sum(r["repeats"] for r in board["rows"]),"allExact":True}}
    packet=["""You are the Opus High physics researcher. Your group built six native functions and three Typed functions and the operator ran them on the real ESP32-P4. You previously submitted the two implementation blocks and lab log. The attached definitive results, final design and qualifications supersede preliminary estimates. Write the final project report and maintain your own public investigation diary.
Before writing, use the private physics/eval tool in your dedicated compiler REPL session. Evaluate simd.executions('physics-guarded_soa_pie','physics-guarded_soa_pie-particle-n128','packed-arithmetic') and one corresponding mesh contact query if supported. Quote exactly what you observe.
Write a technical textbook-quality article ~1800–2400 words for a new compiler student, no analogies. Define halfwords, Q8.8, lane, saturating arithmetic, data layout, transfer cost, checked fallback, conflict coloring, units. Show a small calculation, concrete diagram (Mermaid or plain text), exact executable JS REPL example. Explain the 2×2, scope of a manually chosen checked plan vs stock compiler, original/scheduled/same-order comparisons, validation, conversion amortization as a conditional estimate with regime/units, physical and emulation results with distinct status and populations. Include a reproducibility paragraph referencing ticket script paths with plain code. The collector used 12 rotated particle blocks and 14 rotated contact blocks; 12 fresh invocations each. This is a microkernel measurement, no full game timings. The full P4 capture is 818 correct rows. 280 valid host comparisons + 192 guarded trap/return-prefix controls. Source is a toy velocity-relaxation kernel with prevalidated disjoint contact indices within each group. Grouping measurements cost generation plus coloring plus stable scatter. The actual physics work is first-wave research; do not claim to have trained or validated the lab's separate held-out selector. Cite original source https://box2d.org/posts/2024/08/simd-matters/ and https://developer.espressif.com/blog/2024/12/pie-introduction/ as context only. The lab independently compiles the corrected Typed functions on host and executes those linked words on physical firmware; there are no on-device compilation-time measurements of these physics functions in this chapter.
Write a separate detailed investigation diary, recording public factual activity only, including checked trip count, tool limits, experiment revisions and teaching decisions. Use the step/heading format supplied. Distinguish your output from operator implementation and physical verification. Do not include private deliberation. Return ARTICLE_BEGIN then Markdown title and complete article body then ARTICLE_END, then DIARY_BEGIN then diary markdown then DIARY_END. Do not include YAML. No speculation as fact. Include an explicit practical recommendation using measured numbers and scope.""",
        (Path.home()/".codex/skills/diary/references/investigation-entry.md").read_text(),
        (T/"design-doc/04-fixed-point-particle-layout-and-contact-order.md").read_text(),
        (T/"reference/04-physics-investigation-diary.md").read_text(),
        (T/"various/physics/opus-kernel-log.txt").read_text(),
        (HERE/"physics.typed").read_text(),json.dumps(summary)]
    # Two stage-specific copies; strict MCP allows only the private, loopback evaluator.
    (d/"bridge.py").write_text((HERE/"01-repl-bridge.py").read_text().replace("127.0.0.1:3792","127.0.0.1:3794"))
    (d/"mcp.json").write_text(json.dumps({"mcpServers":{"physics":{"command":"python3","args":[str(d/"bridge.py")]}}}))
    prompt="\n\n".join(packet)
    result=subprocess.run(["claude","-p","--model","opus","--effort","high","--setting-sources","","--settings",'{"disableAllHooks":true}',"--disable-slash-commands","--strict-mcp-config","--mcp-config","./mcp.json","--tools","","--allowedTools","mcp__physics__eval","--permission-mode","dontAsk","--output-format","json"],input=prompt,cwd=d,text=True,stdout=subprocess.PIPE,check=True,timeout=1200)
    events=json.loads(result.stdout); receipt=events[-1] if isinstance(events,list) else events
    text=receipt["result"];(d/"article-response.txt").write_text(text)
    if receipt.get("is_error"): raise ValueError(text[:700])
    if any(marker not in text for marker in ("ARTICLE_BEGIN","ARTICLE_END","DIARY_BEGIN","DIARY_END")):
        raise ValueError("No complete manuscript and diary in public response; preserved article-response.txt")
    article=text.split("ARTICLE_BEGIN",1)[1].split("ARTICLE_END",1)[0].strip()
    diary=text.split("DIARY_BEGIN",1)[1].split("DIARY_END",1)[0].strip()
    (d/"article.md").write_text(article+"\n");(d/"author-diary.md").write_text(diary+"\n")
    record={k:receipt[k] for k in ("session_id","num_turns","stop_reason","is_error","duration_ms")}
    record.update({"model":list(receipt["modelUsage"]),"effort":"high","bodyWords":len(article.split())})
    (d/"authorship.json").write_text(json.dumps(record,indent=2)+"\n");print(record)
if __name__=="__main__":main()
