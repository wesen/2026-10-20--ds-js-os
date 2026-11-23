#!/usr/bin/env python3
"""Move the boards' serial tools to tools/device/ (PICOCALC-REPO-LAYOUT Section 10, leftover).

usage: python3 11-move-device-tools.py [--dry-run]       (on a clean tree)

  firmware/tools/{p4cap,p4put,s3cap,provision_agent}.py  ->  tools/device/

They read nothing relative to their own location. References were relative to firmware/ ("tools/p4cap.py") and
become repository paths, or firmware-relative ones ("../tools/device/...") where the text says to run from
firmware/. Settings' help text names the provisioning tool, so the Settings app's text changes with it.
"""
import subprocess
import sys
from pathlib import Path

REPO = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True).stdout.strip())
DRY = sys.argv[1:] == ["--dry-run"]
assert sys.argv[1:] in ([], ["--dry-run"]), __doc__
TOOLS = ("p4cap", "p4put", "s3cap", "provision_agent")
MOVES = [(f"firmware/tools/{t}.py", f"tools/device/{t}.py") for t in TOOLS]
EDITS = {}


def edit(path, old, new, count=1):
    EDITS.setdefault(path, []).append((old, new, count))


edit("tools/device/p4cap.py", "#   tools/p4cap.py [-p PORT]", "#   tools/device/p4cap.py [-p PORT]")
edit("tools/device/p4put.py", "apps: tools/p4put.py build/natives/echo.wasm apps/echo.wasm", "apps: tools/device/p4put.py firmware/build/natives/echo.wasm apps/echo.wasm")
edit("tools/device/p4put.py", "#   tools/p4put.py LOCAL REMOTE [-p PORT]", "#   tools/device/p4put.py LOCAL REMOTE [-p PORT]")
edit("tools/device/s3cap.py", "    tools/s3cap.py [-p PORT]", "    tools/device/s3cap.py [-p PORT]")
R = "firmware/README.md"
edit(R, "tools/p4cap.py      resets the device, sends console lines, decodes shots to PNG\n",
     "../tools/device/   p4cap.py resets the device, sends console lines, decodes shots to PNG; p4put, s3cap, provision_agent\n")
edit(R, "cd ../.. && python3 tools/p4cap.py -s 20", "cd ../../.. && python3 tools/device/p4cap.py -s 20")
edit(R, "framebuffer for `tools/p4cap.py` to turn", "framebuffer for `tools/device/p4cap.py` to turn")
edit("firmware/port/esp32p4/main/fs_p4.c", "(tools/p4put.py)", "(tools/device/p4put.py)")
edit("firmware/port/esp32s3-papers3/CMakeLists.txt", "# Serial: use tools/s3cap.py,", "# Serial: use tools/device/s3cap.py,")
Q = "firmware/port/esp32s3-papers3/qemu.sh"
edit(Q, "and run tools/s3cap.py on it.", "and run tools/device/s3cap.py on it.")
edit(Q, "python3 ../../tools/s3cap.py -p", "python3 ../../../tools/device/s3cap.py -p")
D = "docs/agent/picocalc-agent-implementation.md"
edit(D, "python3 tools/provision_agent.py \\", "python3 ../tools/device/provision_agent.py \\")
edit(D, "| `tools/provision_agent.py` | Secret-safe", "| `../tools/device/provision_agent.py` | Secret-safe")
edit("apps/js/picocalc/apps/settings.js", "set over USB with tools/provision_agent.py,", "set over USB with tools/device/provision_agent.py,")
edit("AGENTS.md", "| `tools/gen/candela/` | Generators of `firmware/third_party/candela`'s generated files |\n",
     "| `tools/gen/candela/` | Generators of `firmware/third_party/candela`'s generated files |\n"
     "| `tools/device/` | The boards' serial tools: console capture (`p4cap`, `s3cap`), file upload, agent provisioning |\n")


def main():
    if not DRY:
        dirty = subprocess.run(["git", "status", "--porcelain", "--untracked-files=no"], cwd=REPO, capture_output=True, text=True).stdout
        dirty = [l for l in dirty.splitlines() if not l[3:].startswith("ttmp/")]
        assert not dirty, "commit first: " + "\n".join(dirty)
    for src, dest in MOVES:
        assert (REPO / src).exists() and not (REPO / dest).exists(), (src, dest)
        print(("would move" if DRY else "move"), src, "->", dest)
        if not DRY:
            (REPO / dest).parent.mkdir(parents=True, exist_ok=True)
            subprocess.run(["git", "mv", src, dest], cwd=REPO, check=True)
    back = {d: s for s, d in MOVES}
    for path, reps in EDITS.items():
        text = (REPO / (back.get(path, path) if DRY else path)).read_text()
        for old, new, count in reps:
            found = text.count(old)
            assert found == count, (path, old, found, count)
            text = text.replace(old, new)
        print(("would edit" if DRY else "edit"), path, len(reps))
        if not DRY:
            (REPO / path).write_text(text)
            subprocess.run(["git", "add", path], cwd=REPO, check=True)


if __name__ == "__main__":
    main()
