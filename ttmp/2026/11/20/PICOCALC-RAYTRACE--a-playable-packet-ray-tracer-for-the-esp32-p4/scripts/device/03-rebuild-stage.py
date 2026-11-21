"""Overlay a committed production revision in a previously isolated ordinary build."""

import argparse
import subprocess
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument("stage", type=Path)
p.add_argument("revision")
a = p.parse_args()
repo = Path(
    subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip()
)
a.stage = a.stage.resolve()
tree = a.stage / "tree"
assert (tree / "picocalc-os/port/esp32p4").is_dir() and tree != repo
base = (a.stage / "revision").read_text().strip()
target = subprocess.check_output(
    ["git", "rev-parse", "--verify", a.revision + "^{commit}"], cwd=repo, text=True
).strip()
files = subprocess.check_output(
    ["git", "diff", "--name-only", "-z", base, target, "--", "cji", "picocalc-os"],
    cwd=repo,
).split(b"\0")
for entry in filter(None, files):
    name = entry.decode()
    dest = tree / name
    assert dest.resolve().is_relative_to(tree)
    blob = subprocess.run(
        ["git", "show", target + ":" + name], cwd=repo, capture_output=True
    )
    if blob.returncode != 0:
        # Verify this really is a deleted file before removing it from the staging tree.
        if subprocess.check_output(["git", "ls-tree", target, "--", name], cwd=repo):
            raise RuntimeError(blob.stderr.decode(errors="replace"))
        dest.unlink(missing_ok=True)
    else:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(blob.stdout)
    print(name)
(a.stage / "revision").write_text(target + "\n")
