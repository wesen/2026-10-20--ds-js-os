"""Build append-only publication inputs for this study from its ticket."""
import argparse
from pathlib import Path
import shutil
from urllib.parse import quote

p=argparse.ArgumentParser(description=__doc__)
p.add_argument("out",type=Path,help="new scratch directory")
out=p.parse_args().out.resolve()
ticket=Path(__file__).resolve().parents[1]
def body(pattern):
    only,=ticket.glob(pattern)
    return only.read_text().split("\n---\n",1)[1].strip()+"\n"

reader=out/"reader"
vault=out/"vault"
out.mkdir()
reader.mkdir()
(vault/"_assets").mkdir(parents=True)
design=body("design-doc/01*.md")
article=body("analysis/01*.md")
vtext=rtext=article
for file in ("combined-effects.png","combined-editor.png"):
    src=ticket/"various"/file
    rel="../various/"+file
    assert src.is_file() and rel in article, file
    name="picocalc-rv32-"+file
    shutil.copyfile(src,vault/"_assets"/name)
    vtext=vtext.replace(rel,"_assets/"+name)
    rtext=rtext.replace(rel,str(src))
(reader/"01-guide.md").write_text(design)
(reader/"02-report.md").write_text(rtext)
header="""---
title: Integrating branch fusion and compact output on the PicoCalc
type: project-report
created: 2026-11-19
status: complete
ticket: PICOCALC-RV32-COMBINED
tags: [picocalc, compiler, riscv, performance]
---

"""
prior="PROJECT REPORT - PicoCalc Compiler - How a Handheld Compiler Spends Time and Memory.md"
vtext+="\nThe preceding independent studies are collected in the [earlier lab synthesis]("+quote(prior)+").\n"
(vault/"PROJECT REPORT - PicoCalc Compiler - Integrating Branch Fusion and Compact Output.md").write_text(header+vtext)
