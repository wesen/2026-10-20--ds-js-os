#!/usr/bin/env python3
"""Remove the detached build worktrees under /tmp that Step 8 used for profile builds (picocalc-wt-*).

usage: python3 12-remove-build-worktrees.py [--dry-run]

Each one must be a registered worktree of this repository, on a detached HEAD, with no tracked changes. Untracked
files are expected: cji's bootstrap writes its build outputs into the source tree.
"""
import subprocess
import sys

dry = "--dry-run" in sys.argv
out = subprocess.run(["git", "worktree", "list", "--porcelain"], capture_output=True, text=True, check=True).stdout
trees = []
for block in out.strip().split("\n\n"):
    fields = dict(line.split(" ", 1) if " " in line else (line, "") for line in block.splitlines())
    path = fields.get("worktree", "")
    if path.startswith("/tmp/picocalc-wt-"):
        assert "detached" in fields, f"{path} is not detached"
        trees.append(path)
assert trees, "no /tmp/picocalc-wt-* worktrees"
for path in trees:
    dirty = subprocess.run(["git", "-C", path, "status", "--porcelain", "--untracked-files=no"], capture_output=True,
                           text=True, check=True).stdout
    assert not dirty.strip(), f"{path} has tracked changes:\n{dirty}"
for path in trees:
    print(("would remove " if dry else "removing ") + path)
    if not dry:
        subprocess.run(["git", "worktree", "remove", "--force", path], check=True)
if not dry:
    subprocess.run(["git", "worktree", "prune"], check=True)
