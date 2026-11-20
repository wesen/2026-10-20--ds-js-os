"""Append and publish only the five prepared research notes and one figure."""
from argparse import ArgumentParser
from hashlib import sha256
from pathlib import Path
import json
import subprocess

DAY = Path("Projects", "2026", "11", "20")


def deliver(vault, stage):
    def git(*args):
        return subprocess.run(["git", "-C", str(vault), *args], check=True, stdout=subprocess.PIPE).stdout

    def current():
        return git("rev-parse", "HEAD").decode().strip()

    def remote():
        lines = git("ls-remote", "--exit-code", "origin", "refs/heads/main").decode().splitlines()
        if len(lines) != 1:
            raise ValueError("expected one remote main reference")
        return lines[0].split()[0]

    def changed_paths(commit):
        return set(git("diff-tree", "--no-commit-id", "--name-only", "-z", "-r", commit)
                   .decode().strip("\0").split("\0"))

    if git("branch", "--show-current").strip() != b"main":
        raise ValueError("vault checkout must be on main")
    manifest = json.loads((stage / "manifest.json").read_text())
    contents = {}
    for name, digest in manifest["paths"].items():
        path = Path(name)
        if not path.is_relative_to(DAY) or ".." in path.parts:
            raise ValueError(f"outside the dated vault folder: {name}")
        contents[name] = (stage / path).read_bytes()
        if sha256(contents[name]).hexdigest() != digest:
            raise ValueError(f"staging checksum differs: {name}")
    notes = [Path(name) for name in contents if Path(name).suffix == ".md"]
    figures = [Path(name) for name in contents if Path(name).suffix == ".png"]
    if len(contents) != 6 or len(notes) != 5 or len(figures) != 1:
        raise ValueError("expected five notes and one PNG")
    if any(note.parent != DAY or not note.name.startswith("ARTICLE - PicoCalc PSIX - ") for note in notes):
        raise ValueError("unexpected PSIX note path")
    if figures[0].parent != DAY / "_assets":
        raise ValueError("unexpected PSIX figure path")

    paths = list(contents)
    initial, published = current(), remote()
    if initial != published:
        if git("rev-parse", "HEAD^").decode().strip() != published or changed_paths(initial) != set(paths):
            raise ValueError("vault main contains changes outside the prepared publication")
    else:
        for name, data in contents.items():
            target = vault / name
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists():
                if target.read_bytes() != data:
                    raise FileExistsError(f"vault destination has different contents: {name}")
            else:
                with target.open("xb") as file:
                    file.write(data)
        git("add", "--", *paths)
        git("diff", "--cached", "--check", "--", *paths)
        staged = git("diff", "--cached", "--name-only", "-z", "--", *paths).decode().strip("\0")
        if staged:
            if set(staged.split("\0")) != set(paths):
                raise ValueError("only part of the publication is staged")
            print(git("commit", "--only", "-m", "Publish PicoCalc PSIX specialization research", "--", *paths)
                  .decode().strip())

    revision = current()
    if revision != published:
        if changed_paths(revision) != set(paths):
            raise ValueError("publication commit contains other changes")
        for name, data in contents.items():
            if git("show", revision + ":" + name) != data:
                raise ValueError(f"commit contains different bytes: {name}")
        git("push", "origin", "HEAD:main")
    if remote() != revision:
        raise ValueError("origin/main differs from the verified publication")
    for name, data in contents.items():
        if git("show", revision + ":" + name) != data:
            raise ValueError(f"verified remote commit contains different bytes: {name}")

    print(f"Verified vault origin/main {revision}")
    for name in contents:
        print(name)


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("vault", type=Path)
    parser.add_argument("stage", type=Path)
    args = parser.parse_args()
    deliver(args.vault.resolve(strict=True), args.stage.resolve(strict=True))


if __name__ == "__main__":
    main()
