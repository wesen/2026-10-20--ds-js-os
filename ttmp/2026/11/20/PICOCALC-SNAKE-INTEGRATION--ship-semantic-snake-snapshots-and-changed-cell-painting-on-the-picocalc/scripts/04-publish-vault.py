"""Stage or publish the three completed Snake reports and their figures to the dated vault."""

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit

p = argparse.ArgumentParser(description=__doc__)
p.add_argument("stage", type=Path)
p.add_argument(
    "--vault",
    type=Path,
    default=Path("/home/manuel/code/wesen/go-go-golems/go-go-parc"),
)
p.add_argument("--publish", action="store_true")
args = p.parse_args()
ticket = Path(__file__).resolve().parents[1]
repo = Path(
    subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip()
)
day = Path("Projects/2026/11/20")
articles = sorted((ticket / "analysis").glob("*.md"))
assert len(articles) == 3, (
    "the director, hardware and correctness articles must be ready"
)
notes, bodies, titles, files = {}, {}, {}, {}


def git(*argv):
    return subprocess.check_output(["git", "-C", args.vault, *argv], text=True).strip()


def sha(data):
    return hashlib.sha256(data).hexdigest()


for article in articles:
    body = article.read_text().split("\n---\n", 1)[1].strip()
    h1 = re.search(r"^# (.+)$", body, re.M)
    assert h1 and len(body.split()) >= 550, article
    title = h1[1]
    notes[article] = Path(
        "ARTICLE - PicoCalc Snake - " + re.sub(r'[<>:"/\\|?*]', "", title) + ".md"
    )
    titles[article] = title
    bodies[article] = body
for article in articles:

    def ref(m):
        mark, label, target = m.group(1, 2, 3)
        url = urlsplit(target.strip("<>"))
        if url.scheme or not url.path:
            return m[0]
        asset = (article.parent / unquote(url.path)).resolve(strict=True)
        if not asset.is_relative_to(repo):
            raise ValueError(asset)
        if mark:
            assert asset.suffix == ".png" and asset.is_relative_to(ticket)
            name = Path("_assets", asset.name)
            files[day / name] = asset.read_bytes()
            return "![" + label + "](" + quote(name.as_posix()) + ")"
        if asset in notes:
            return "[" + label + "](" + quote(notes[asset].name) + ")"
        return label + " (`" + asset.relative_to(repo).as_posix() + "`)"

    chunks = re.split(r"(^```[^\n]*\n[\s\S]*?^```[^\n]*$)", bodies[article], flags=re.M)
    for i in range(0, len(chunks), 2):
        chunks[i] = re.sub(r"(!?)\[([^\]\n]+)\]\((<[^>]+>|[^()\s]+)\)", ref, chunks[i])
    related = "\n".join(
        "- [" + titles[a] + "](" + quote(notes[a].name) + ")"
        for a in articles
        if a != article
    )
    body = "".join(chunks) + "\n\n## Companion studies\n\n" + related + "\n"
    front = (
        "---\ntitle: "
        + json.dumps(titles[article])
        + "\naliases: []\ntags: [article, picocalc, graphics, embedded-systems]\ntype: article\nstatus: complete\ncreated: 2026-11-20\nrepo: "
        + json.dumps(str(repo))
        + "\n---\n\n"
    )
    files[day / notes[article]] = (front + body).encode()
for name, data in files.items():
    dst = args.stage / name
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_bytes(data)
manifest = {name.as_posix(): sha(data) for name, data in files.items()}
(args.stage / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
if args.publish:
    assert git("branch", "--show-current") == "main"
    head = git("rev-parse", "HEAD")
    remote = git("ls-remote", "origin", "refs/heads/main").split()[0]
    if head != remote:
        changed = set(git("diff", "--name-only", remote, head).splitlines())
        assert changed == set(manifest), "vault has other unpublished work"
    for name, data in files.items():
        dst = args.vault / name
        if dst.exists():
            assert dst.read_bytes() == data, dst
        else:
            dst.parent.mkdir(parents=True, exist_ok=True)
            with dst.open("xb") as out:
                out.write(data)
    paths = list(manifest)
    git("add", "--", *paths)
    git("diff", "--cached", "--check", "--", *paths)
    if git("diff", "--cached", "--name-only", "--", *paths):
        git(
            "commit",
            "--only",
            "-m",
            "Publish physical and replay qualification of PicoCalc Snake rendering",
            "--",
            *paths,
        )
    rev = git("rev-parse", "HEAD")
    assert set(
        git("diff-tree", "--no-commit-id", "--name-only", "-r", rev).splitlines()
    ) == set(paths)
    git("push", "origin", "HEAD:main")
    assert git("ls-remote", "origin", "refs/heads/main").split()[0] == rev
    for name, data in files.items():
        assert (
            subprocess.check_output(
                ["git", "-C", args.vault, "show", rev + ":" + name.as_posix()]
            )
            == data
        )
    print("Verified vault origin/main", rev)
    for name in files:
        print(name)
else:
    print(
        "Staged", len(articles), "articles and", len(files) - len(articles), "figures"
    )
