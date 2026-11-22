#!/usr/bin/env python3
"""Copy the issue into the Obsidian vault as one folder of linked notes.

Each file in sources/issue/ becomes "<Issue> - NN - <Title>.md" with YAML frontmatter and a navigation
line (previous, contents, next) appended. Figures are copied to _assets/ beside the notes.
The script only writes inside the target folder and never deletes anything there; rerunning it
overwrites the notes it produced.

Usage: publish_to_vault.py [--vault DIR] [--dry-run]
"""
import argparse
import re
import shutil
from pathlib import Path

TICKET = Path(__file__).resolve().parent.parent
ISSUE = TICKET / "sources" / "issue"
REPO = TICKET.parents[4]
ISSUE_NAME = "Compiling on a Handheld"
SUBTITLE = "A Special Issue on Analysis, Code Generation, Isolation and Types for the PicoCalc"
COMPANION = ("PROJECT REPORT - picocalc-os - Two Compilers on the PicoCalc - From a 25-Minute Build to Typed Apps "
             "Compiled at Boot - A Technical Deep Dive")
DEFAULT_VAULT = Path("/home/manuel/code/wesen/go-go-golems/go-go-parc/Research/2026/11/19/compiling-on-a-handheld")
TAGS = {
    "00": ["editorial"], "01": ["embedded", "esp32-p4"], "02": ["measurement", "performance"],
    "03": ["type-inference", "program-analysis"], "04": ["program-analysis", "type-systems"],
    "05": ["code-generation", "riscv", "webassembly"], "06": ["caching", "load-time"],
    "07": ["isolation", "security"], "08": ["asynchrony", "language-design"],
    "09": ["type-systems", "language-design"], "10": ["architecture", "roadmap"],
    "11": ["glossary"], "12": ["bibliography"], "13": ["exercises"], "14": ["reader-study"],
    "15": ["bibliography"],
}


def title_of(text: str) -> str:
    first = text.lstrip().splitlines()[0]
    return re.sub(r"^#\s*(\d+\.\s*)?", "", first).strip()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--vault", default=str(DEFAULT_VAULT))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    target = Path(args.vault)
    files = sorted(ISSUE.glob("[0-9][0-9]-*.md"))
    notes = []
    for path in files:
        text = path.read_text()
        number = path.name[:2]
        title = title_of(text)
        short = title.split(":")[0].strip()
        notes.append((number, title, f"{ISSUE_NAME} - {number} - {short}", text))
    if not args.dry_run:
        (target / "_assets").mkdir(parents=True, exist_ok=True)
        for asset in sorted((ISSUE / "_assets").glob("*.png")):
            shutil.copy2(asset, target / "_assets" / asset.name)
    contents = notes[0][2]
    for index, (number, title, name, text) in enumerate(notes):
        tags = ["article", "special-issue", "picocalc", "compilers"] + TAGS.get(number, [])
        front = ["---", f'title: "{ISSUE_NAME} {number}: {title}"', "aliases:", f'  - "{title}"',
                 "tags:"] + [f"  - {t}" for t in tags] + [
                 "status: active", "type: article", "created: 2026-11-19", f"repo: {REPO}",
                 f'issue: "{ISSUE_NAME}: {SUBTITLE}"', f"part: {int(number)}",
                 "source_revision: 60a38f098d18adb46fc4fe22442a9249c0890d33", "---", ""]
        nav = []
        if index > 0:
            nav.append(f"Previous: [[{notes[index - 1][2]}|{notes[index - 1][1]}]]")
        if index != 0:
            nav.append(f"Contents: [[{contents}|Editorial and reading guide]]")
        if index + 1 < len(notes):
            nav.append(f"Next: [[{notes[index + 1][2]}|{notes[index + 1][1]}]]")
        body = text.rstrip() + "\n\n---\n\n" + " · ".join(nav) + "\n"
        # the editorial's table of contents uses {{link:NN}} placeholders
        def link(match, in_table):
            target = next(n for n in notes if n[0] == match.group(1))
            bar = "\\|" if in_table else "|"       # a bare pipe inside a table cell would end the cell
            return f"[[{target[2]}{bar}{target[1]}]]"
        body = "\n".join(re.sub(r"\{\{link:(\d\d)\}\}", lambda m, t=line.lstrip().startswith("|"): link(m, t), line)
                         for line in body.split("\n"))
        body = body.replace("*Two Compilers on the PicoCalc*", f"[[{COMPANION}|Two Compilers on the PicoCalc]]", 1)
        out = target / f"{name}.md"
        print(("would write " if args.dry_run else "wrote ") + str(out) + f" ({len(body.split())} words)")
        if not args.dry_run:
            out.write_text("\n".join(front) + body)


if __name__ == "__main__":
    main()
