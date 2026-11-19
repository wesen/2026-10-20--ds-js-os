#!/usr/bin/env python3
"""Prepare a portable edition of the reviewed articles in an empty staging directory."""
import argparse
import re
import shutil
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit

TICKET = Path(__file__).resolve().parents[2]
REPORTS = TICKET / "various/reports"
SERIES = {
    "synthesis": "Cold Compilation on a Handheld",
    "lowering": "Operand Registers on RV32",
    "representation": "Function Representations and Streaming",
    "bounds": "Bounded Proofs for Text Access",
    "examiner": "Examining Calls and Bounds Proofs",
    "methods": "Measuring Compiler Costs",
}
ASSET = "_assets/picocalc-compiler-thesis-experiments.png"
FOLLOWUPS = {
    "physical-editor": "Numeric Operands on the Physical ESP32-P4",
    "negative-results": "Negative Results and Deferred Optimizations",
}
FOLLOWUP_ASSETS = ["_assets/picocalc-p4-compiler-qualification.png",
                   "_assets/picocalc-p4-compiler-editor-preview.png"]


def filename(key):
    return f"PROJECT REPORT - PicoCalc Compiler - {(SERIES | FOLLOWUPS)[key]}.md"


def render(key):
    """Resolve ticket-relative evidence paths and add navigation for vault readers."""
    source = REPORTS / f"{key}.md"

    def convert(match):
        label, target = match.groups()
        parts = urlsplit(target)
        if parts.scheme or not parts.path or parts.path.startswith("_assets/"):
            return match.group()
        path = (source.parent / unquote(parts.path)).resolve(strict=True)
        if path.parent == REPORTS and path.stem in (SERIES | FOLLOWUPS):
            anchor = "#" + parts.fragment if parts.fragment else ""
            return f"[{label}]({quote(filename(path.stem))}{anchor})"
        relative = path.relative_to(TICKET)
        return f"{label} (`{relative}`)"

    body = re.sub(r"\[([^\]\n]+)\]\(([^)\n]+)\)", convert, source.read_text())
    if key == "synthesis":
        body += "\n## Companion studies and independent examination\n\n"
        body += "\n".join(f"- [{title}]({quote(filename(k))})"
                          for k, title in SERIES.items() if k != key) + "\n"
    else:
        body += "\n## Research series\n\n"
        body += f"[Read the synthesis and the other studies.]({quote(filename('synthesis'))})\n"
    return body


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="empty directory for staging before publication")
    parser.add_argument("--followups", action="store_true", help="prepare the physical and negative-results papers")
    args = parser.parse_args()
    out = args.output
    out.mkdir(parents=True, exist_ok=True)
    if any(out.iterdir()):
        parser.error("the output directory must be empty")
    pages = {filename(k): render(k) for k in (FOLLOWUPS if args.followups else SERIES)}
    (out / ASSET).parent.mkdir()
    for asset in (FOLLOWUP_ASSETS if args.followups else [ASSET]):
        shutil.copyfile(REPORTS / asset, out / asset)
    for name, body in pages.items():
        (out / name).write_text(body)


if __name__ == "__main__":
    main()
