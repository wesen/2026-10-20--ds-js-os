"""Run representative scenarios with the current PicoCalc QuickJS host and catalog."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

SCRIPTS = Path(__file__).resolve().parent
REPO = next(p for p in SCRIPTS.parents if (p / "picocalc-os/Makefile").exists())
OS = REPO / "picocalc-os"
BINARY = OS / "build/picocalc-host"


def run(root, name, script, js=OS / "js", seeded=True):
    work = root / name
    files, records, out = (work / part for part in ("files", "records", "out"))
    for path in [files, records, out]:
        path.mkdir(parents=True)
    if seeded:
        shutil.copytree(OS / "fs-seed", files, dirs_exist_ok=True)
    command = [str(BINARY), "-j", str(js), "-o", str(out), "-f", str(files), "-s", str(records), "-"]
    ran = subprocess.run(command, input=script, text=True, capture_output=True, cwd=OS, timeout=30)
    uart = (out / "uart.log").read_text()
    if ran.returncode or "CRASH" in uart:
        raise AssertionError(uart + ran.stdout + ran.stderr)
    return files, records, out, uart


def boundary(root, catalog):
    js = root / "js"
    js.mkdir()
    for source, target in [
        (catalog / "prelude.js", "prelude.js"),
        (catalog / "system/sandbox.js", "sandbox.js"),
        (SCRIPTS / "boundary-probe.js", "probe.js"),
        (SCRIPTS / "boundary-peer.js", "peer.js"),
    ]:
        shutil.copyfile(source, js / target)
    worlds = [
        {"name": "catalog-probe", "file": "probe.js", "claims": ["fs:/"]},
        {"name": "catalog-peer", "file": "peer.js"},
        {"name": "sandbox", "file": "sandbox.js"},
    ]
    for item in worlds:
        item.update(mem_kb=512, budget_ms=200)
    (js / "system.json").write_text(json.dumps({"worlds": worlds}))
    _, _, _, uart = run(root, "boundary", "wait 1000\n", js=js, seeded=False)
    actual = [line.split("CATALOG ", 1)[1] for line in uart.splitlines() if "CATALOG " in line]
    expected = [
        "absent-null-falsy", "json-values", "suspending-reply", "missing-handler",
        "nested-handle-and-file-io", "revocation", "sandbox-print-completion",
        "sandbox-global-async", "sandbox-errors",
    ]
    assert actual == [name + " PASS" for name in expected], uart
    for line in actual:
        print(line)


def applications(root, catalog):
    files, _, out, _ = run(root, "files", (OS / "scripts/files.txt").read_text(), js=catalog)
    new_note = (files / "notes/ideas.md").read_text()
    assert "# Ideas\n- a calculator that graphs\n- an agenda with reminders" in new_note, new_note
    assert (out / "59-editor-new.png").stat().st_size > 0
    print("files-editor new file written through a narrowed handle PASS")

    files, records, out, _ = run(root, "agenda", (OS / "scripts/agenda.txt").read_text(), js=catalog)
    todo = (files / "notes/todo.txt").read_text()
    for fragment in ("dentist @2026-10-22 09:44 !2m", "call Anna @2026-10-23", "standup @2026-10-26 09:30", "renew passport @2027-10-20"):
        assert fragment in todo, todo
    assert "- [x] standup @2026-10-26 09:30" in todo
    fired = json.loads((records / "w/agenda").read_text())["fired"]
    assert sum(key.endswith("|dentist") for key in fired) == 1, fired
    assert (out / "74-reminder.png").stat().st_size > 0
    print("agenda normalized dates, wrote completion, and persisted a reminder PASS")

    keys = """wait 1200
key x
wait 400
type 2/3
key enter
type f(x) = x^2/4 - 2
key enter
type f(3)
key enter
wait 3500
"""
    _, records, _, _ = run(root, "calc", keys, js=catalog)
    stored = json.loads((records / "w/calc").read_text())
    history = stored["calc"]["hist"]
    want = ["= 0.666666666667", "f(x) defined", "= 0.25"]
    assert [item["r"] for item in history[-3:]] == want, stored
    print("calc fractional evaluation and user definition persisted in history PASS")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rewrites", action="store_true")
    options = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="picocalc-catalog-") as tmp:
        root = Path(tmp)
        catalog = OS / "js"
        if options.rewrites:
            catalog = root / "rewrites" / "js"
            command = ["node", str(SCRIPTS / "stage-rewrites.cjs"), str(OS / "js"), str(catalog)]
            subprocess.run(command, check=True)
            shutil.copytree(OS / "tests", catalog.parent / "tests")
            logic = ["agenda", "calc", "agent", "chat-ui", "compositor-auth", "sysapps", "editor"]
            suite = ["node", "--test", "--test-isolation=none", "--test-reporter=tap", *["tests/" + name + ".test.mjs" for name in logic]]
            tested = subprocess.run(suite, cwd=catalog.parent, text=True, capture_output=True)
            if tested.returncode:
                raise AssertionError(tested.stdout + tested.stderr)
            for line in tested.stdout.splitlines():
                if line.startswith(("# tests ", "# pass ", "# fail ")):
                    print(line)
        boundary(root, catalog)
        applications(root, catalog)
