#!/usr/bin/env python3
"""Run one reading round: every student takes every article's quiz before and after reading it.

For article NN and condition C in {pre, post} the script creates
    sources/students/<round>/aNN-C/materials/   quiz.md or article.md, TASK.md, diary-format.md
    sources/students/<round>/aNN-C/s1 ...       one directory per student (see run_students.py)
and runs all sessions through a shared thread pool.

  pre   the student sees only the questions and answers from prior knowledge
  post  the student reads the article, answers the same questions, and gives feedback

Usage:
  run_round.py --round round1 --student s1:minimal --student s2:medium --student s3:high \
      [--articles 01,02] [--conditions pre,post] [--workers 8]

Answer keys are never copied into a student directory.
"""
import argparse
import concurrent.futures
import json
import re
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import run_students  # noqa: E402

TICKET = run_students.TICKET
ISSUE = TICKET / "sources" / "issue"
DIARY_FORMAT = Path.home() / ".claude/skills/diary/references/investigation-entry.md"

TASK_PRE = """# Your task (before reading)

You are a student reader helping an editor test a teaching article before it is published.
Work only inside this directory. Do not search the web.

1. Read `quiz.md`. It contains questions about an article you have NOT been given.
2. Answer every question from what you already know and can reason out. Write the answers to
   `answers.md`, numbered like the questions. Two to five sentences each. If a question depends on
   facts you cannot know without the article, say "I cannot know this without the article" and
   then give your best reasoning about what the answer would have to look like.
3. After each answer add a line `Confidence: N` with N from 1 (guessing) to 5 (certain).
4. Write `diary.md`: one step, in the format of `diary-format.md`, recording what you did, which
   questions you could answer and which you could not, and why.

Finish by replying with one line: DONE.
"""

TASK_POST = """# Your task (after reading)

You are a student reader helping an editor test a teaching article before it is published.
Work only inside this directory. Do not search the web. Be honest: the editor needs to know
where the article fails to teach.

1. Read `article.md` from start to finish.
2. Answer the questions in its "Check your understanding" section. Write the answers to
   `answers.md`, numbered like the questions. Two to six sentences each, in your own words; show
   working where a question asks for a calculation or a translation. After each answer add a line
   `Confidence: N` with N from 1 (guessing) to 5 (certain).
3. Write `feedback.md` with these sections:
   - **Passages I had to read twice**: quote each (one or two sentences) and say what was unclear.
   - **Terms used before they were explained, or never explained**: one line each.
   - **Claims I could not verify from the article itself**: quote each and say what evidence or
     step is missing.
   - **Section scores**: for each numbered section, a score from 1 (lost) to 5 (clear) and one
     sentence of reason.
   - **Questions that the article did not let me answer**: which quiz questions, if any, could not
     be answered from the text, and what was missing.
   - **One thing to add and one thing to cut**.
4. Write `diary.md`: a work diary of this session in the format of `diary-format.md`, with one
   step for reading, one for the quiz and one for the feedback. Record what was hard.

Finish by replying with one line: DONE.
"""


def article_files(selected: set[str] | None) -> list[Path]:
    files = sorted(p for p in ISSUE.glob("[0-9][0-9]-*.md") if "Check your understanding" in p.read_text())
    if selected:
        files = [p for p in files if p.name[:2] in selected]
    return files


def quiz_of(article: Path) -> str:
    text = article.read_text()
    match = re.search(r"^## \d+\.\d+ Check your understanding\n(.*?)(?=^## |\Z)", text, re.S | re.M)
    if not match:
        sys.exit(f"no quiz section in {article.name}")
    title = text.splitlines()[0].lstrip("# ").strip()
    return f"# Questions for the article \"{title}\"\n\n{match.group(1).strip()}\n"


def build_materials(round_dir: Path, article: Path, condition: str, with_glossary: bool = False) -> Path:
    cell = round_dir / f"a{article.name[:2]}-{condition}"
    materials = cell / "materials"
    if materials.exists():
        shutil.rmtree(materials)  # only ever a directory this script created, under students/<round>/
    materials.mkdir(parents=True)
    if condition == "pre":
        (materials / "quiz.md").write_text(quiz_of(article))
        (materials / "TASK.md").write_text(TASK_PRE)
    else:
        shutil.copy2(article, materials / "article.md")
        task = TASK_POST
        glossary = ISSUE / "11-glossary.md"
        if with_glossary and glossary.exists():
            shutil.copy2(glossary, materials / "glossary.md")
            task = task.replace("1. Read `article.md` from start to finish.",
                                "1. Read `article.md` from start to finish. The series has a glossary, `glossary.md`; "
                                "look terms up there as a reader would, and report in your feedback only terms that "
                                "neither the article nor the glossary explains.")
        (materials / "TASK.md").write_text(task)
    shutil.copy2(DIARY_FORMAT, materials / "diary-format.md")
    return cell


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--round", required=True)
    parser.add_argument("--student", action="append", required=True)
    parser.add_argument("--articles", default="")
    parser.add_argument("--conditions", default="pre,post")
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--timeout", type=int, default=1500)
    parser.add_argument("--model", default="deepseek-4.1-flash")
    parser.add_argument("--with-glossary", action="store_true", help="give post-reading students the series glossary")
    args = parser.parse_args()

    round_dir = run_students.checked_round_dir(str(TICKET / "sources" / "students" / args.round))
    round_dir.mkdir(parents=True, exist_ok=True)
    students = [entry.split(":", 1) for entry in args.student]
    selected = {a.strip() for a in args.articles.split(",") if a.strip()} or None
    jobs = []
    for article in article_files(selected):
        for condition in args.conditions.split(","):
            cell = build_materials(round_dir, article, condition, args.with_glossary)
            for name, thinking in students:
                student = run_students.prepare(cell, cell / "materials", name, fresh=True)
                jobs.append((student, thinking, article.name, condition))
    print(f"{len(jobs)} sessions", flush=True)
    results = []
    prompt = "Read TASK.md and carry out every step in order."
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(run_students.run, student, thinking, args.model, prompt, args.timeout, "read,write,edit"):
                   (student, article, condition) for student, thinking, article, condition in jobs}
        for future in concurrent.futures.as_completed(futures):
            student, article, condition = futures[future]
            status = future.result()
            status.update(article=article, condition=condition)
            results.append(status)
            print(json.dumps({k: status.get(k) for k in ("article", "condition", "student", "thinking_effective", "exit", "seconds")}), flush=True)
    results.sort(key=lambda s: (s["article"], s["condition"], s["student"]))
    (round_dir / "status.json").write_text(json.dumps(results, indent=2) + "\n")
    failed = [s for s in results if s.get("exit") != 0 or "answers.md" not in s.get("files", [])]
    print(f"done: {len(results)} sessions, {len(failed)} without answers or with a non-zero exit")


if __name__ == "__main__":
    main()
