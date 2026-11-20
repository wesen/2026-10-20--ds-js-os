"""Extract each reviewed Opus article and its chronological investigations from the preserved research receipts."""
import argparse
import json
from pathlib import Path
import re

TICKET = Path(__file__).resolve().parents[1]
STUDIES = {
    "language": ("02", "Forward calls and erased types in a two-target compiler", "PICOCALC-LANGUAGE-E"),
    "continuations": ("03", "A compiler proof of the values that survive a wait", "PICOCALC-CONTINUATION-G"),
    "editor": ("04", "How to measure a complete generated search on a handheld", "PICOCALC-EDITOR-ASYNC"),
}


def parts(data):
    text = data["text"].strip()
    mark = re.search(r"^#{1,4} .*?diary.*$", text, re.I|re.M)
    if not mark:
        raise ValueError("researcher did not provide the requested separate diary")
    return text[:mark.start()].strip().removesuffix("---").strip(), text[mark.end():].strip()


def document(path, title, kind, text):
    metadata = f"""---
Title: "{title}"
Ticket: PICOCALC-EG-QUAL
Status: review
Topics:
    - picocalc
    - performance
DocType: {kind}
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Independent Opus High analysis checked against the implementation and its recorded experiments."
LastUpdated: 2026-11-20T00:00:00-05:00
WhatFor: "Read with the implementation team's compiler and application measurements."
WhenToUse: "When studying the completed E and G compiler phases."
---
"""
    contents = metadata+"\n"+text.strip()+"\n"
    if path.exists() and path.read_text()!=contents:
        raise ValueError(f"refusing to overwrite an edited document at {path}")
    path.write_text(contents)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("lane", choices=STUDIES)
    parser.add_argument("--phase", choices=("report","revised"), required=True)
    args=parser.parse_args()
    n, title, companion=STUDIES[args.lane]
    def receipt(phase):
        src = TICKET/"various/opus"/f"{args.lane}-{phase}.json"
        return src,json.loads(src.read_text())
    selected, data=receipt(args.phase)
    article, unused_diary=parts(data)
    edits = TICKET/"sources/verified"/(args.lane+"-edits.json")
    if edits.is_file():
        for old, new in json.loads(edits.read_text()).items():
            if article.count(old) != 1:
                raise ValueError(f"research article changed since technical review: {old!r}")
            article = article.replace(old, new)
    heading, separator, body=article.partition("\n")
    if not separator or not heading.startswith("# "):
        raise ValueError("expected a titled article")
    output = TICKET/"analysis"/(n+"-independent-"+args.lane+"-study.md")
    sources = "\n\nThe implementation team supplied the measurements for this independent article. The companion ticket is `"+companion+"`. [Verified inputs](../sources/verified/"+args.lane+".md) · [Researcher's investigation diary](../reference/"+n+"-independent-"+args.lane+"-diary.md)"
    document(output,title,"analysis","# "+title+"\n"+body+sources)
    sections=["# Independent "+args.lane+" research diary"]
    for i,phase in enumerate(["design","report"]+(["revised"] if args.phase=="revised" else []),1):
        path, raw=receipt(phase)
        _, diary=parts(raw)
        sections.append(f"## Step {i}. {phase.capitalize()}\n\nModel `{raw['model'][0]}` with {raw['effort']} effort. Request SHA-256 `{raw['prompt_sha256']}`. [Dated study receipt](../various/opus/{path.name})\n\n"+diary)
    document(TICKET/"reference"/(n+"-independent-"+args.lane+"-diary.md"),title+" investigation diary","reference","\n\n".join(sections))
    print(output)


if __name__=="__main__":
    main()
