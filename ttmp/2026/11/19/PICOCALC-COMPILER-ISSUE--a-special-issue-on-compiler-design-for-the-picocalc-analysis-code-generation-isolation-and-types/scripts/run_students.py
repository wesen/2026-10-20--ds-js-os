#!/usr/bin/env python3
"""Run student readers (pi coding agents on a small model) for one round.

Each student gets its own directory under the round directory, a copy of the
materials, and one pi session. The session transcript (JSONL) stays in
<student>/session, the final reply in reply.txt, and the outcome in run-status.json.

Usage:
  run_students.py --round-dir DIR --materials DIR --student s1:minimal --student s2:medium \
      --prompt "Read TASK.md and carry out every step in order." [--fresh] [--timeout 1500]

Deletion is deliberately narrow: --fresh removes only direct children of the round
directory whose names look like a student directory (s1, s2 medium, ...), and only
when the round directory itself sits under the sources/students directory of this ticket.
"""
import argparse
import concurrent.futures
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

TICKET = Path(__file__).resolve().parent.parent
STUDENT_DIR = re.compile(r"^s\d+( \w+)?$")
LUNAROUTE_EXTENSION = Path.home() / ".pi/agent/npm/node_modules/@lunaroute/pi-extension"
SYSTEM_NOTE = ("You are a student reader. Work only with files in the current directory. "
               "Do not use the web. When you do not know something, say so plainly.")


def checked_round_dir(path: str) -> Path:
    round_dir = Path(path).resolve()
    students = (TICKET / "sources" / "students").resolve()
    if students not in round_dir.parents:
        sys.exit(f"refusing to work outside {students}: {round_dir}")
    return round_dir


def remove_stale(round_dir: Path, keep: set[str]) -> None:
    """Remove earlier student directories in this round, and nothing else."""
    for child in round_dir.iterdir():
        if not child.is_dir() or child.is_symlink():
            continue
        if child.name in keep or not STUDENT_DIR.match(child.name):
            continue
        print(f"removing stale student directory: {child}")
        shutil.rmtree(child)


def prepare(round_dir: Path, materials: Path, name: str, fresh: bool) -> Path:
    student = round_dir / name
    if fresh and student.exists():
        if not STUDENT_DIR.match(student.name):
            sys.exit(f"refusing to remove {student}")
        shutil.rmtree(student)
    student.mkdir(parents=True, exist_ok=True)
    for item in sorted(materials.iterdir()):
        if item.is_file():
            shutil.copy2(item, student / item.name)
    return student


def run(student: Path, thinking: str, model: str, prompt: str, timeout: int, tools: str) -> dict:
    (student / "session").mkdir(exist_ok=True)
    command = [
        "pi", "-p", "--provider", "lunaroute", "--model", model, "--thinking", thinking,
        "--no-extensions", "-e", str(LUNAROUTE_EXTENSION),
        "--no-mcp", "--no-context-files", "--no-skills", "--no-prompt-templates",
        "--session-dir", "./session", "--tools", tools,
        "--append-system-prompt", SYSTEM_NOTE, prompt,
    ]
    started = time.time()
    status = {"student": student.name, "thinking_requested": thinking, "model": model}
    try:
        # stdin must be empty: in print mode the agent reads piped standard input and waits for its end
        done = subprocess.run(command, cwd=student, capture_output=True, text=True, timeout=timeout,
                              stdin=subprocess.DEVNULL)
        status["exit"] = done.returncode
        (student / "reply.txt").write_text(done.stdout)
        (student / "stderr.txt").write_text(done.stderr)
    except subprocess.TimeoutExpired as expired:
        status["exit"] = "timeout"
        (student / "reply.txt").write_text(expired.stdout or "" if isinstance(expired.stdout, str) else "")
    status["seconds"] = round(time.time() - started, 1)
    sessions = sorted((student / "session").glob("*.jsonl"))
    status["session"] = sessions[-1].name if sessions else None
    if sessions:
        for line in sessions[-1].read_text().splitlines():
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if event.get("type") == "thinking_level_change":
                status["thinking_effective"] = event.get("thinkingLevel")
    status["files"] = sorted(p.name for p in student.iterdir() if p.is_file())
    (student / "run-status.json").write_text(json.dumps(status, indent=2) + "\n")
    return status


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--round-dir", required=True)
    parser.add_argument("--materials", required=True)
    parser.add_argument("--student", action="append", required=True, help="name:thinking, e.g. s1:minimal")
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--model", default="deepseek-4.1-flash")
    parser.add_argument("--tools", default="read,write,edit")
    parser.add_argument("--timeout", type=int, default=1500)
    parser.add_argument("--fresh", action="store_true", help="recreate the named student directories")
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()

    round_dir = checked_round_dir(args.round_dir)
    materials = Path(args.materials).resolve()
    students = [entry.split(":", 1) for entry in args.student]
    for name, _ in students:
        if not STUDENT_DIR.match(name) or " " in name:
            sys.exit(f"bad student name: {name}")
    round_dir.mkdir(parents=True, exist_ok=True)
    if args.fresh:
        remove_stale(round_dir, keep={name for name, _ in students} | {materials.name})
    prepared = [(prepare(round_dir, materials, name, args.fresh), thinking) for name, thinking in students]
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(run, student, thinking, args.model, args.prompt, args.timeout, args.tools)
                   for student, thinking in prepared]
        for future in concurrent.futures.as_completed(futures):
            status = future.result()
            print(json.dumps({k: status[k] for k in ("student", "thinking_requested", "thinking_effective", "exit", "seconds")
                              if k in status}))


if __name__ == "__main__":
    main()
