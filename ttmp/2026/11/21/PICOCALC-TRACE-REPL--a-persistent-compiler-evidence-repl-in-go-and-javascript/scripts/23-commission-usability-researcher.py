#!/usr/bin/env python3
"""Commission Opus High with explicit research material, no agent tools, and no shell."""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile

T = Path(__file__).resolve().parent.parent
V = Path.home()/"code/wesen/go-go-golems/go-go-parc/Projects/2026/11/21"
K = Path.home()/".codex/skills"
PB = ["ARTICLE - Playbook - Improving an Agent-Facing JavaScript API with Persona Runs - Lessons from homolog-bench.md",
      "ARTICLE - Playbook - Persona Sessions with Agents - Improving Software and APIs from Usability Reports.md"]
DIARY = T/"reference/08-usability-researcher-diary.md"
ARTICLE = T/"analysis/04-using-blind-compiler-engineers-to-qualify-an-evidence-api.md"

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("stage", choices=["protocol", "baseline-audit", "publication"])
    a = parser.parse_args()
    stage = a.stage
    inputs = [*(V / n for n in PB), K/"diary/references/investigation-entry.md",
              K/"textbook-authoring/SKILL.md", K/"obsidian-vault-writing/SKILL.md",
              *sorted((T/"scripts/personas").glob("*.md")), *sorted((T/"playbooks").glob("01*.md"))]
    if stage == "baseline-audit":
        inputs += [*sorted((T/"various/personas").glob("baseline-*.json")),
                   T/"various/usability-controls-baseline.json", T/"various/usability-raw-loop-census.json",
                   T/"various/usability-loops-baseline.json", T/"various/usability-replay-baseline.json",
                   next(T.parent.glob("PICOCALC-TRACE-QUERY--*/various/verified-facts.json"))]
    if stage == "publication":
        inputs += [DIARY, *sorted((T/"analysis").glob("01-what-compiler*.md")),
                   *sorted((T/"various/personas").glob("*.json")), *sorted((T/"design-doc").glob("02-*.md")),
                   *sorted((T/"reference").glob("04-usability-diary.md")),
                   *sorted((T/"reference").glob("10-independent-baseline-grades.md")),
                   *sorted((T/"various").glob("usability-loops-*.json")),
                   *sorted((T/"various").glob("usability-replay-*.json")),
                   T/"various/usability-raw-loop-census.json"]
    prompt = """You are the lab's lead usability researcher, commissioned at Opus High. Independent DeepSeek Flash high compiler engineers are the actual blind participants. Your work is methodological review, your own chronological investigation diary, and later a research article using real evidence for new compiler students. Ground every claim in the supplied records. Do not assert that you yourself ran a tool or that any model is a human. The two named playbooks supply the methods. Preserve the experimental task cards. No analogies, slogans, semicolons or sales pitch. Use exact names for queries and files. Explain evidence units where used. Return a single JSON object, no code fence, with the requested Markdown bodies as JSON strings. No frontmatter.\n"""
    if stage == "protocol":
        prompt += """Review the pre-registered protocol and the new scientific-decision rubric. Write the first detailed investigation entry for your own diary in diary-skill format, including where filtering, blindness, truth keys and scope can fail. Write a concise usable preregistration critique with verification tests the independent supervisor can perform. No result claims or article yet. Keys: diary, critique."""
    elif stage == "baseline-audit":
        prompt += """Grade the four observed baseline participants from their actual actions and final responses using the supplied independent evidence. The supervisor's first grades have been withheld. For each card distinguish correct numeric recovery, source witnesses and false or unsupported extra conclusions. For the optimization card score each of the five scientific dimensions from the protocol; state the actual proposed intervention and the refuting result. The stock workload has 3,608,697 instructions, 936,328 direct stack loads and 353,778 stores. Include only a concise grade table, strongest disputed claim and how to verify it. Do not grade a proposed optimization as a validated new implementation. No article or new diary until final reporting. Key: grade."""
    else:
        prompt += """The observed rounds and independent grades now accompany this request. Author the final vault technical article for newcomers (roughly 2000–3000 words, concise when the evidence is thin). Work one real participant's question step by step from input through query, first failure/recovery, evidence and scientific recommendation; teach static vs dynamic vs physical units. Describe method refinements, retests, remaining limitations, actual signature changes and which compiler optimizations were only proposed vs genuinely validated. Favor excerpts of real queries over reproducing whole transcripts. Include one diagram or pseudocode for reconstruction and an example of what a falsifying experiment would measure. Avoid duplication of the supervisor's results table. Check your draft against the actions, read it once as a newcomer, revise. Also write your final detailed diary step about review, observations and limits. Keys: diary, article."""
    for path in inputs:
        prompt += "\n\n--- INPUT " + path.name + " ---\n" + path.read_text()
    with tempfile.TemporaryDirectory(prefix="trace-usability-researcher-") as work:
        proc = subprocess.run(["claude","--print","--model","opus","--effort","high","--safe-mode",
            "--strict-mcp-config","--no-session-persistence","--tools","","--output-format","json"],
            cwd=work,input=prompt,text=True,capture_output=True,timeout=1200)
    if proc.returncode:
        raise SystemExit((proc.stderr or proc.stdout)[-2000:])
    envelope = json.loads(proc.stdout)
    if isinstance(envelope, list):
        result = next((event for event in reversed(envelope)
                       if event.get("type") == "result"), {})
    else:
        result = envelope
    if result.get("is_error") or not result.get("result"):
        raise SystemExit("Claude did not complete the authoring task: " +
                         str(result.get("result") or result.get("subtype") or "missing result"))
    payload = result["result"].strip()
    if payload.startswith("```"):
        payload = payload.split("\n",1)[1].rsplit("```",1)[0]
    try:
        docs = json.loads(payload)
    except json.JSONDecodeError:
        # Preserve the user-visible response for reconstruction without retaining thought events.
        (T/"various"/f"usability-researcher-{stage}-response.txt").write_text(payload)
        raise
    if stage == "protocol":
        DIARY.write_text(frontmatter("Lead usability researcher diary", "reference") +
                         "# Lead usability researcher diary\n\n"+docs["diary"].strip()+"\n")
        dest = T/"reference/09-usability-protocol-review.md"
        dest.write_text(frontmatter("Pre-registered usability protocol review", "reference") +
                        "# Pre-registered usability protocol review\n\n"+docs["critique"].strip()+"\n")
    elif stage == "baseline-audit":
        (T/"reference/10-independent-baseline-grades.md").write_text(frontmatter("Independent baseline persona grades", "reference")+
            docs["grade"].strip()+"\n")
    else:
        ARTICLE.write_text(frontmatter("How blind compiler engineers qualify an evidence API", "analysis") +
                           docs["article"].strip()+"\n")
        with DIARY.open("a") as out:
            out.write("\n"+docs["diary"].strip()+"\n")
    summary = {"stage":stage,"modelAlias":"opus","effort":"high","modelUsage":list(result.get("modelUsage",{})),
               "durationMs":result.get("duration_ms"),"inputs":[p.name for p in inputs]}
    (T/"various"/f"usability-researcher-{stage}.json").write_text(json.dumps(summary,indent=2)+"\n")
    print(json.dumps({k:v for k,v in summary.items() if k != "inputs"}))

def frontmatter(title,kind):
    return (f"---\nTitle: {title}\nTicket: PICOCALC-TRACE-REPL\nStatus: active\n"
            f"Topics: [compiler, performance, picocalc]\nDocType: {kind}\nIntent: long-term\n"
            "Owners: []\nRelatedFiles: []\nExternalSources: []\n---\n\n")
if __name__ == "__main__":
    main()
