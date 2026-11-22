#!/usr/bin/env python3
"""Summarize quiz grades for one round.

Reads sources/students/<round>/grades/*.json. Each file is a list of rows:
  {"article": "01", "condition": "pre"|"post", "student": "s1", "question": 1, "score": 0|1|2, "note": "..."}
Writes sources/students/<round>/grades-summary.md with, per article, the mean score out of 12 before and
after reading, the per-student scores, and every question whose mean post-reading score is below 1.5
(the questions the article fails to teach, or that are badly posed).

Usage: summarize_grades.py --round round1
"""
import argparse
import collections
import json
from pathlib import Path

TICKET = Path(__file__).resolve().parent.parent


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--round", required=True)
    args = parser.parse_args()
    round_dir = TICKET / "sources" / "students" / args.round
    rows = []
    for path in sorted((round_dir / "grades").glob("*.json")):
        rows.extend(json.loads(path.read_text()))
    total = collections.defaultdict(int)       # (article, condition, student) -> score
    count = collections.defaultdict(int)
    per_question = collections.defaultdict(list)  # (article, condition, question) -> [scores]
    notes = collections.defaultdict(list)
    for r in rows:
        key = (str(r["article"]).zfill(2), r["condition"], r["student"])
        total[key] += int(r["score"])
        count[key] += 1
        per_question[(key[0], key[1], int(r["question"]))].append(int(r["score"]))
        if r.get("note") and int(r["score"]) < 2 and r["condition"] == "post":
            notes[(key[0], int(r["question"]))].append(f"{r['student']}: {r['note']}")
    articles = sorted({k[0] for k in total})
    students = sorted({k[2] for k in total})
    lines = [f"# Quiz results for {args.round}", "",
             "Scores are out of 12 per article (six questions, 0 to 2 points each).", "",
             "| Article | " + " | ".join(f"{s} pre" for s in students) + " | " + " | ".join(f"{s} post" for s in students) +
             " | Mean pre | Mean post | Gain |",
             "| --- | " + " | ".join("---:" for _ in range(2 * len(students) + 3)) + " |"]
    grand = {"pre": [], "post": []}
    for a in articles:
        cells = {}
        for cond in ("pre", "post"):
            cells[cond] = [total.get((a, cond, s)) for s in students]
        means = {}
        for cond in ("pre", "post"):
            present = [v for v in cells[cond] if v is not None]
            means[cond] = sum(present) / len(present) if present else float("nan")
            grand[cond].extend(present)
        fmt = lambda v: "–" if v is None else str(v)
        lines.append(f"| {a} | " + " | ".join(fmt(v) for v in cells["pre"]) + " | " + " | ".join(fmt(v) for v in cells["post"]) +
                     f" | {means['pre']:.1f} | {means['post']:.1f} | {means['post'] - means['pre']:+.1f} |")
    if grand["pre"] and grand["post"]:
        gp, gq = sum(grand["pre"]) / len(grand["pre"]), sum(grand["post"]) / len(grand["post"])
        lines.append(f"| all | " + " | ".join("" for _ in range(2 * len(students))) + f" | {gp:.1f} | {gq:.1f} | {gq - gp:+.1f} |")
    lines += ["", "## Questions with a mean post-reading score below 1.5", ""]
    weak = [(a, q, s) for (a, cond, q), s in sorted(per_question.items()) if cond == "post" and sum(s) / len(s) < 1.5]
    if not weak:
        lines.append("None.")
    for a, q, s in weak:
        lines.append(f"- Article {a}, question {q}: scores {s}")
        for note in notes.get((a, q), []):
            lines.append(f"  - {note}")
    lines += ["", "## Questions answered well before reading (mean pre-reading score of 1.5 or more)", "",
              "These questions do not test the article; a reader can answer them from general knowledge.", ""]
    easy = [(a, q, s) for (a, cond, q), s in sorted(per_question.items()) if cond == "pre" and sum(s) / len(s) >= 1.5]
    lines.append(", ".join(f"{a}.{q}" for a, q, _ in easy) or "None.")
    (round_dir / "grades-summary.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
