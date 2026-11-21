"""Stage or publish the Typed ray tracer research reports and their linked figures."""

import argparse
from datetime import date
import hashlib
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import quote, unquote, urlsplit

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("stage", type=Path)
parser.add_argument("--publish", action="store_true")
parser.add_argument(
    "--vault",
    type=Path,
    default=Path("/home/manuel/code/wesen/go-go-golems/go-go-parc"),
)
parser.add_argument("--ticket", type=Path, default=Path(__file__).resolve().parents[2])
parser.add_argument("--series", default="Typed Ray Tracer Lab")
parser.add_argument("--count", type=int, default=4)
parser.add_argument("--date", required=True, type=date.fromisoformat, help="Publication date YYYY-MM-DD")
args = parser.parse_args()
ticket = args.ticket.resolve()
asset_prefix = re.sub(r"[^a-z0-9]+", "-", args.series.lower()).strip("-")
repo = Path(
    subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip()
)
day = Path("Projects", args.date.strftime("%Y/%m/%d"))
articles = sorted((ticket / "analysis").glob("*.md"))
assert len(articles) == args.count, "waiting for all commissioned research articles"
titles, bodies, names, files = {}, {}, {}, {}
for article in articles:
    body = article.read_text().split("\n---\n", 1)[1].strip()
    title = re.search(r"^# (.+)$", body, re.M)[1].strip()
    assert len(body.split()) >= 600, article
    titles[article] = title
    bodies[article] = body
    names[article] = (
        f"ARTICLE - PicoCalc {args.series} - "
        + re.sub(r'[<>:"/\\|?*]', "", title)
        + ".md"
    )
assert len(set(names.values())) == args.count
for article in articles:

    def rewrite(match):
        mark, label, link = match.groups()
        target = urlsplit(link.strip("<>"))
        if target.scheme or not target.path:
            return match[0]
        path = (article.parent / unquote(target.path)).resolve(strict=True)
        if not path.is_relative_to(repo):
            raise ValueError(path)
        if mark or path.suffix == ".gif":
            assert path.is_relative_to(ticket) and path.suffix in {".png", ".svg", ".gif"}
            asset = Path("_assets", asset_prefix + "-" + path.name)
            data = path.read_bytes()
            if day / asset in files and files[day / asset] != data:
                # A host preview and a device capture may share a descriptive basename.
                suffix = "-".join(path.relative_to(ticket).parts)
                asset = Path("_assets", asset_prefix + "-" + suffix)
            assert (day / asset) not in files or files[day / asset] == data
            files[day / asset] = data
            return f"{mark}[{label}]({quote(asset.as_posix())})"
        if path in names:
            return f"[{label}]({quote(names[path])})"
        return f"{label} (`{path.relative_to(repo).as_posix()}`)"

    parts = re.split(r"(^```[^\n]*\n[\s\S]*?^```[^\n]*$)", bodies[article], flags=re.M)
    for i in range(0, len(parts), 2):
        parts[i] = re.sub(
            r"(!?)\[([^\]\n]+)\]\((<[^>]+>|[^()\s]+)\)", rewrite, parts[i]
        )
    src = "\n".join(
        "- [" + titles[a] + "](" + quote(names[a]) + ")"
        for a in articles
        if a != article
    )
    metadata = (
        "---\ntitle: "
        + json.dumps(titles[article])
        + "\ntype: article\ntags: [article, picocalc, compilers, performance]\ncreated: " + args.date.isoformat() + "\nstatus: complete\nrepo: "
        + json.dumps(str(repo))
        + "\n---\n\n"
    )
    files[day / names[article]] = (
        metadata + "".join(parts) + "\n\n## Companion studies\n\n" + src + "\n"
    ).encode()
manifest = {str(path): hashlib.sha256(data).hexdigest() for path, data in files.items()}
for name, data in files.items():
    dest = args.stage / name
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
(args.stage / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print("Prepared", len(articles), "articles and", len(files) - len(articles), "figures.")
if args.publish:

    def git(*cmd):
        return subprocess.check_output(
            ["git", "-C", args.vault, *cmd], text=True
        ).strip()

    assert git("branch", "--show-current") == "main"
    head = git("rev-parse", "HEAD")
    remote = git("ls-remote", "origin", "refs/heads/main").split()[0]
    if head != remote:
        assert set(git("diff", "--name-only", remote, head).splitlines()) == set(
            manifest
        ), "other unpublished vault work exists"
    for name, data in files.items():
        dest = args.vault / name
        if dest.exists():
            assert dest.read_bytes() == data, dest
        else:
            dest.parent.mkdir(parents=True, exist_ok=True)
            with dest.open("xb") as fd:
                fd.write(data)
    paths = list(manifest)
    git("add", "--", *paths)
    git("diff", "--cached", "--check", "--", *paths)
    if git("diff", "--cached", "--name-only", "--", *paths):
        git(
            "commit",
            "--only",
            "-m",
            f"Publish the PicoCalc {args.series} research lab reports",
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
                ["git", "-C", args.vault, "show", rev + ":" + str(name)]
            )
            == data
        )
    print("Verified remote main", rev)
