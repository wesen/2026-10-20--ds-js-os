"""Publish the corrected manuscript and its separate author diary to ticket documents."""
import json
from pathlib import Path


ticket=Path(__file__).resolve().parents[1]
manuscript=json.loads((ticket/"various/independent-revised.json").read_text())["text"]
body,diary=manuscript.split("\n---\n\n## Investigation Diary",1)
title,body=body.split("\n",1)
body=body.replace("per eligible cursor position", "per eligible cursor")
body=body.replace("A manual control—using an earlier compiler and a different source—established a qualification threshold at a median of 2,645,557 µs (2.646 s).",
                  "An earlier compiler built the handwritten Editor in a median of 2,645,557 µs (2.646 s). The qualification ceiling allows ten percent beyond that time.")
body=body.replace("The PicoCalc Editor compiles typed source", "The PicoCalc device compiler translates the Editor's typed source")
body=body.replace("## Analysis of Time","![Physical cold compile times and compiler allocation](../various/lexical-device-comparison.png)\n\n## Analysis of Time")
body += "\n\n[Verified board samples](../various/physical-index-boots.json) · [Matched comparisons](../various/physical-comparison.json) · [Producer test](../various/producer-differential.json)"
for folder,pattern,title,content in (
        ("analysis","01-*","What token indexing buys on a physical PicoCalc",body),
        ("reference","03-*","Independent device measurement review diary",diary)):
    path,=(ticket/folder).glob(pattern)
    header=path.read_text().split("---\n",2)[1]
    path.write_text("---\n"+header+"---\n\n# "+title+"\n\n"+content.strip()+"\n")
