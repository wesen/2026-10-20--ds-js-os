#!/usr/bin/env python3
"""Render the PAPERS3-PORT design guide (Markdown) into the HTML page published as an Artifact.

    python3 scripts/01-render-guide-artifact.py OUT.html

Reads ../design-doc/01-*.md, drops the YAML front matter, converts the body with pandoc (GFM), and wraps it
in a styled page: a progress strip built from the phase table in section 15, a table of contents, and the
guide itself. Rerun after every update to the guide, then republish the same OUT.html.
"""
import html, pathlib, re, subprocess, sys

here = pathlib.Path(__file__).resolve().parent
doc = next((here.parent / "design-doc").glob("01-*.md"))
out = pathlib.Path(sys.argv[1])
text = doc.read_text()
body_md = text.split("\n---\n", 1)[1] if text.startswith("---") else text
body_md = re.sub(r"^# .*\n", "", body_md.lstrip(), count=1)  # the page has its own heading

# the phase table in section 15: | Phase | Status | Commit | Notes |
phases = []
sec15 = body_md.split("## 15.", 1)[1] if "## 15." in body_md else ""
for line in sec15.splitlines():
    cells = [c.strip() for c in line.strip().strip("|").split("|")]
    if len(cells) >= 4 and cells[0] not in ("Phase",) and not set(cells[0]) <= set("-: "):
        phases.append(cells[:4])

def state(s):
    s = s.lower()
    if s.startswith(("done", "written", "complete")): return "done"
    if "blocked" in s: return "blocked"
    if "progress" in s or "partial" in s: return "active"
    return "todo"

strip = "".join(
    f'<li class="ph {state(p[1])}"><span class="ph-name">{html.escape(p[0])}</span>'
    f'<span class="ph-state">{html.escape(p[1])}</span></li>' for p in phases)

frag = subprocess.run(["pandoc", "-f", "gfm", "-t", "html5", "--toc", "--toc-depth=2", "-s",
                       "--template", str(here / "01-guide-template.html")],
                      input=body_md, capture_output=True, text=True, check=True).stdout
toc, content = frag.split("<!--SPLIT-->", 1)
updated = re.search(r"^LastUpdated: (\S+)", text, re.M)
page = (here / "01-guide-shell.html").read_text()
page = page.replace("{{STRIP}}", strip).replace("{{TOC}}", toc).replace("{{CONTENT}}", content)
page = page.replace("{{UPDATED}}", html.escape(updated.group(1)[:16].replace("T", " ") if updated else ""))
out.write_text(page)
print(f"wrote {out} ({len(page)} bytes, {len(phases)} phases)")
