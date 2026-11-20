"""Prepare the five PSIX research articles and director figure for the vault."""
from argparse import ArgumentParser
from hashlib import sha256
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit
import json
import re

TICKET = Path(__file__).resolve().parents[2]
REPO = TICKET.parents[4]
DATE = "2026-11-20"
DAY = Path("Projects", "2026", "11", "20")
ARTICLE_NAMES = (
    "01-compiling-the-screen-writer-on-a-handheld.md",
    "02-static-encoder.md",
    "03-observed-shapes.md",
    "04-staging-and-binding.md",
    "07-independent-specialization-results.md",
)
ARTICLES = tuple(TICKET / "analysis" / name for name in ARTICLE_NAMES)
RELATED = ((1, 2, 3, 4), (0, 3, 4), (0, 3), (0, 1, 2), (0, 3))
PRIOR_REPORTS = {
    "PICOCALC-RENDER-BINARY": (
        "ARTICLE - PicoCalc Rendering - What an index on the wire buys a PicoCalc renderer.md"
    ),
    "PICOCALC-RENDER-CHESS": (
        "ARTICLE - PicoCalc Rendering - What crosses the screen boundary when a Chess cursor moves.md"
    ),
    "PICOCALC-RENDER-SYSTEM": (
        "ARTICLE - PicoCalc - How Much of a System Screen Must Cross the Mailbox.md"
    ),
}
LINK = re.compile(
    r"(?P<image>!?)\[(?P<label>[^\]\n]*)\]"
    r"\((?P<target><[^>\n]+>|[^\s()]+)"
    r"(?P<title>\s+\"[^\"\n]*\")?\)"
)
FENCE = re.compile(r"^ {0,3}(`{3,}|~{3,})")


def content(path):
    source = path.read_text()
    if not source.startswith("---\n") or "\n---\n" not in source[4:]:
        raise ValueError(f"{path} is missing frontmatter")
    body = source.split("\n---\n", 1)[1].strip() + "\n"
    match = re.search(r"^# (.+)$", body, re.MULTILINE)
    if match is None:
        raise ValueError(f"{path} is missing its title")
    return match[1], body


def rewrite_links(text, replace):
    lines = []
    fence = None
    for line in text.splitlines(keepends=True):
        opening = FENCE.match(line)
        if opening:
            marks = opening[1]
            if fence is None:
                fence = marks
            elif marks.startswith(fence):
                fence = None
            lines.append(line)
        elif fence is None:
            lines.append(LINK.sub(replace, line))
        else:
            lines.append(line)
    return "".join(lines)


def reference(match, source):
    url = urlsplit(match["target"].strip("<>"))
    if url.scheme or url.netloc or not url.path:
        return None, None
    target = (source.parent / unquote(url.path)).resolve(strict=True)
    if not target.is_relative_to(REPO):
        raise ValueError(f"local reference leaves source repo: {source.name} → {target}")
    return target, url.fragment


def markdown_link(label, path, fragment=""):
    href = quote(path.as_posix())
    return f"[{label}]({href}{'#' + fragment if fragment else ''})"


def check_sources(paths):
    for path in paths:
        title, body = content(path)

        def check(match):
            reference(match, path)
            return match[0]

        rewrite_links(body, check)
        print(f"Checked source links in {title}")


def prepare(vault, stage):
    articles = [content(path) for path in ARTICLES]
    filenames = [
        Path("ARTICLE - PicoCalc PSIX - " + re.sub(r'[<>:"/\\|?*]', "", title) + ".md")
        for title, _ in articles
    ]
    links = dict(zip(ARTICLES, filenames, strict=True))
    assets = {}
    written = {}

    for i, (path, (title, body), filename) in enumerate(zip(ARTICLES, articles, filenames, strict=True)):
        def rewrite(match):
            target, fragment = reference(match, path)
            if target is None:
                return match[0]
            label = match["label"]
            if match["image"]:
                if i != 0 or target.suffix.lower() != ".png":
                    raise ValueError(f"unexpected local figure in {path}: {target}")
                asset = Path("_assets", target.name)
                assets[asset] = target.read_bytes()
                return "!" + markdown_link(label, asset, fragment)
            if target in links:
                return markdown_link(label, links[target], fragment)
            if target.suffix == ".md" and target.parent.name in ("analysis", "design-doc"):
                for prefix, prior in PRIOR_REPORTS.items():
                    if target.parent.parent.name.startswith(prefix + "--"):
                        if not (vault / DAY / prior).is_file():
                            raise ValueError(f"missing prior article {prior}")
                        return markdown_link(label, Path(prior))
            relative = target.relative_to(REPO)
            return f"{label} (`{relative.as_posix()}{'#' + fragment if fragment else ''}`)"

        body = rewrite_links(body, rewrite)
        related = "\n".join(
            "- " + markdown_link(articles[index][0], filenames[index]) for index in RELATED[i]
        )
        metadata = (
            f"---\ntitle: {json.dumps(title, ensure_ascii=False)}\naliases: []\n"
            "tags: [article, picocalc, psix, compiler, esp32-p4]\n"
            f"status: complete\ntype: article\ncreated: {DATE}\n"
            f"repo: {json.dumps(str(REPO))}\n---\n\n"
        )
        note = metadata + body
        if "\n## Related vault notes\n" in body:
            raise ValueError(f"duplicate companion section in {path}")
        note += f"\n## Related vault notes\n\n{related}\n"
        written[DAY / filename] = note.encode()

    if len(assets) != 1:
        raise ValueError(f"expected the director's single PNG figure, found {list(assets)}")
    written.update({DAY / name: data for name, data in assets.items()})
    for relative, data in written.items():
        original = vault / relative
        if original.exists() and original.read_bytes() != data:
            raise FileExistsError(f"vault destination has different contents: {relative}")
        mounted = stage / relative
        mounted.parent.mkdir(parents=True, exist_ok=True)
        if mounted.exists() and mounted.read_bytes() != data:
            raise FileExistsError(f"staging path differs: {relative}")
        mounted.write_bytes(data)

    for relative, data in written.items():
        if relative.suffix != ".md":
            continue

        def validate(match):
            url = urlsplit(match["target"].strip("<>"))
            if not url.scheme and not url.netloc and url.path:
                local = relative.parent / unquote(url.path)
                if not (stage / local).is_file() and not (vault / local).is_file():
                    raise FileNotFoundError(f"broken vault reference from {relative.name}: {url.path}")
            return match[0]

        rewrite_links(data.decode(), validate)

    manifest = {
        "articles": len(articles),
        "figures": len(assets),
        "paths": {str(relative): sha256(data).hexdigest() for relative, data in written.items()},
    }
    (stage / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(f"Prepared and verified {len(articles)} articles and one figure in {stage}")


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--check", choices=("design", "analysis"))
    parser.add_argument("--vault", type=Path)
    parser.add_argument("--stage", type=Path)
    args = parser.parse_args()
    if args.check:
        check_sources(sorted((TICKET / "design-doc").glob("*.md")) if args.check == "design" else ARTICLES)
    elif args.vault and args.stage:
        prepare(args.vault, args.stage)
    else:
        parser.error("choose --check or both --vault and --stage")


if __name__ == "__main__":
    main()
