#!/usr/bin/env python3
"""Drive Agenda and Files on the PicoCalc through console key injection, on the image that is installed.

usage (repository root): python3 ttmp/.../scripts/03-workflows.py OUT [--peripherals on|off-by-user]

Under the board lock. Saves notes/todo.txt, replaces it with a fixture, then in Agenda: add a task, edit another,
tick it, add one that is due a minute ago (a reminder within 15 s if the wall clock is set); in Files: browse to
notes/ and open todo.txt in the Editor. After every step it reads the file back (`cat`) and takes a screenshot
(OUT/NN-step.png). Finally restores the user's notes/todo.txt (`put`), returns to the launcher and writes
OUT/workflows.json.
"""
import argparse
import base64
import json
import os
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[6]
sys.path.insert(0, str(REPO / "bench/board"))
import device  # noqa: E402
import gallery  # noqa: E402

FIXTURE = "- [ ] alpha @2026-12-01 09:00\n- beta\n"


def cat(console, path):
    lines = console.command("cat " + path, timeout=10)
    return "\n".join(lines)


def size(console, directory, name):
    for line in console.command("ls " + directory, timeout=10):
        parts = line.split()
        if len(parts) == 2 and parts[0] == name:
            return int(parts[1])
    return None


def backup(console):
    """notes/todo.txt's exact bytes: cat shows the first 4 KB and adds a final newline if there is none, so the
    size from ls decides; refuse to go on when it cannot."""
    n = size(console, "notes", "todo.txt")
    if n is None:
        return None
    text = cat(console, "notes/todo.txt")
    for candidate in (text + "\n", text):
        if len(candidate.encode()) == n:
            return candidate
    raise RuntimeError(f"cannot back up notes/todo.txt exactly ({n} bytes)")


def put(console, path, text):
    """Replace a file: put PATH creates it empty, then each put appends at most 510 bytes."""
    lines = console.command("put " + path, timeout=10)
    data = text.encode()
    for at in range(0, len(data), 510):
        lines += console.command("put " + path + " " + base64.b64encode(data[at:at + 510]).decode(), timeout=10)
    return lines


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("out", type=Path)
    ap.add_argument("--peripherals", choices=("on", "off-by-user"), default="on")
    ap.add_argument("--port", default=device.PORT)
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=False)
    steps = []
    with device.acquire(), (a.out / "uart.log").open("wb", buffering=0) as log:
        console = device.Console(a.port, log)
        rec = gallery.Records(a.out / "cgal.jsonl")
        n = [0]

        def step(name, keys=(), wait=1.5, typed=None):
            for k in keys:
                console.command("key " + k)
                time.sleep(.25)
            if typed:
                console.command("type " + typed, timeout=10)
                time.sleep(.3 + .1 * len(typed))
            time.sleep(wait)
            n[0] += 1
            shot = gallery.shot(console, rec, a.out)
            (a.out / "boot.png").rename(a.out / f"{n[0]:02d}-{name}.png")
            text = cat(console, "notes/todo.txt")
            steps.append({"step": name, "file": text, "shot": shot})
            print(name, json.dumps(text), flush=True)
            return text

        try:
            health = device.health(console, a.peripherals)
            # The gallery's records would interleave with the console's answers.
            gallery.command(console, rec, "gallery pause", timeout=60)
            tz = console.command("tz")
            original = backup(console)
            if original is not None:
                (a.out / "original-todo.txt").write_text(original)
            put(console, "notes/todo.txt", FIXTURE)
            console.command("key f1")
            time.sleep(1)
            step("agenda-open", ["t"], wait=2)
            step("agenda-add", ["f2"], typed="gamma @2026-12-02 10:00 !15m", wait=0)
            step("agenda-added", ["enter"], wait=2)
            # With an empty notes file at boot nothing is selected (as in the C and JavaScript Agendas) until Up.
            step("agenda-edit", ["up", "f3", "backspace", "backspace", "backspace", "backspace", "backspace"], typed="11:30", wait=0)
            step("agenda-edited", ["enter"], wait=2)
            step("agenda-ticked", ["space"], wait=2)
            step("agenda-f6-editor", ["f6"], wait=3)
            console.command("key f1")
            time.sleep(1)
            step("agenda-back", ["t"], wait=2)
            # A task due a minute ago rings at the next 15 s tick when the wall clock is set (zone from `tz`).
            zone = next((l.split(": ", 1)[1].split(" ")[0] for l in tz if l.startswith("tz: ")), "UTC0")
            os.environ["TZ"] = zone
            time.tzset()
            due = time.localtime(time.time() - 60)
            ring = f"ring @{time.strftime('%Y-%m-%d %H:%M', due)}"
            step("agenda-ring-prompt", ["f2"], typed=ring, wait=0)
            step("agenda-ring-saved", ["enter"], wait=1)
            step("agenda-ring-banner", [], wait=17)
            console.command("key f1")
            time.sleep(1)
            step("files-open", ["d"], wait=2)
            # Files lists the root; walk down to notes/ (entries sort directories first, by name).
            root = sorted(l.strip()[:-1] for l in console.command("ls", timeout=10) if l.strip().endswith("/"))
            downs = root.index("notes") if "notes" in root else 0
            step("files-notes", ["pgup"] * 30 + ["down"] * downs + ["enter"], wait=2)
            notes = console.command("ls notes", timeout=10)
            files_in_notes = sorted(l.split()[0] for l in notes if not l.strip().endswith("/"))
            dirs_in_notes = sum(1 for l in notes if l.strip().endswith("/"))
            index = dirs_in_notes + files_in_notes.index("todo.txt")
            step("files-selected", ["down"] * index, wait=1)
            step("editor-open", ["enter"], wait=3)
            (a.out / "ls.txt").write_text("\n".join(root) + "\n--- notes\n" + "\n".join(notes))
            worlds = console.worlds()
            result = {"health": health, "tz": tz, "ring": ring, "steps": steps,
                      "worlds": {k: {f: worlds[k].get(f) for f in ("engine", "file", "state", "restarts", "last_error")}
                                 for k in ("agenda", "files", "editor")}}
        finally:
            try:
                if (a.out / "original-todo.txt").exists():
                    put(console, "notes/todo.txt", (a.out / "original-todo.txt").read_text())
                    restored = backup(console) == (a.out / "original-todo.txt").read_text()
                    print("restored notes/todo.txt:", restored, flush=True)
                console.command("key f1")
                gallery.command(console, rec, "gallery resume", timeout=30)
            finally:
                console.close()
    device.save(a.out / "workflows.json", result)


if __name__ == "__main__":
    main()
