"""Stage the reMarkable guide with a clickable, offline repository reference map."""
import argparse
import hashlib
from pathlib import Path
import re
import shutil


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("guide", type=Path)
parser.add_argument("directory", type=Path)
args = parser.parse_args()
guide = args.guide.resolve(strict=True)
repo = next(parent for parent in guide.parents if (parent / ".git").exists())
raw = guide.read_text()
frontmatter = re.compile(r"\A---\n.*?\n---\n", re.DOTALL)
body = frontmatter.sub("", raw, count=1).lstrip()
title, body = body.split("\n", 1)
if not title.startswith("# "):
    raise ValueError("The guide must begin with its title")
title = title.removeprefix("# ")
args.directory.mkdir(parents=True, exist_ok=True)
assets = args.directory / "figures"
assets.mkdir(exist_ok=True)

references = {}
figures = {}
local_link = re.compile(r"(?P<image>!)?\[(?P<label>[^\[\]\n]*)\]\((?P<target>\.\.?/[^()\n]+)\)")


def local_reference(match):
    label = match["label"]
    url = match["target"]
    target, _, fragment = url.partition("#")
    source_path = guide.parent / target
    resolved = source_path.resolve(strict=True)
    relative = resolved.relative_to(repo)
    if match["image"]:
        filename = figures.setdefault(resolved, f"{len(figures) + 1:02}-{resolved.name}")
        shutil.copyfile(resolved, assets / filename)
        return f"![{label}](figures/{filename})"
    key = (relative, source_path.is_dir(), fragment)
    index = references.setdefault(key, len(references) + 1)
    return f"[{label} · R{index:02}](#r{index:02})"


fenced_code = re.compile(r"^(```[\w+-]*\n(.*?)^\x60\x60\x60[ \t]*$)", re.DOTALL | re.MULTILINE)


def reserve_rows(rows):
    return f"```{{=latex}}\n\\Needspace{{{rows}\\baselineskip}}\n```\n\n"


def keep_code_together(match):
    return reserve_rows(len(match[2].splitlines()) + 3) + match[1]


def wrap_digest(match):
    digest = match[1]
    return " ".join(f"`{digest[index:index + 16]}`" for index in range(0, 64, 16))


def wrap_table_code(match):
    code = match[1]
    if len(code) < 24:
        return match[0]
    escaped = {
        "\\": r"\textbackslash{}", "{": r"\{", "}": r"\}", "_": r"\_",
        "%": r"\%", "&": r"\&", "#": r"\#", "$": r"\$",
        "^": r"\textasciicircum{}", "~": r"\textasciitilde{}"
    }
    chunks = re.split(r"(?<=[/_,(:.])", code)
    chunks = ["".join(escaped.get(character, character) for character in chunk) for chunk in chunks]
    return "`\\texttt{" + r"\allowbreak{}".join(chunks) + "}`{=latex}"


body = local_link.sub(local_reference, body)
body = "\n".join(re.sub(r"`([^`]+)`", wrap_table_code, line) if line.startswith("|") else line
                 for line in body.split("\n"))
body = fenced_code.sub(keep_code_together, body)
body = re.sub(r"^#{2,3} .+(?=\n\n\|)", lambda match: reserve_rows(12) + match[0], body, flags=re.MULTILINE)
body = re.sub(r"`([a-f0-9]{64})`", wrap_digest, body)
groups = {}
for (path, is_dir, fragment), index in references.items():
    parts = path.parts
    if parts[0] == "ttmp" and len(parts) >= 5 and "--" in parts[4]:
        group_path = Path(*parts[:5])
        group_name = parts[4].split("--", 1)[0]
        prefix = group_name + "--*"
        group_glob = group_path.parent / prefix
        if len(list((repo / group_path.parent).glob(prefix))) != 1:
            group_glob = group_path
        group = group_name, str(group_glob) + "/"
        path = path.relative_to(group_path)
    else:
        group = "Source tree", parts[0] + "/"
        path = path.relative_to(parts[0])
    name = str(path) + ("/" if is_dir else "") + (f"#{fragment}" if fragment else "")
    groups.setdefault(group, []).append((index, name))

body += "\n\n## Repository reference map\n\n"
body += "Open these paths from a checkout of the repository. Each group gives the prefix for its entries. The ticket prefixes use shell globs that match one directory each.\n"
for (name, prefix), values in groups.items():
    body += f"\n\n**{name}** · `{prefix}`\n\n"
    for index, path in values:
        body += f"- [**R{index:02}**]{{#r{index:02}}} `{path}`\n"

staged = args.directory / (title + ".md")
staged.write_text(body)
print(f"source_sha256={hashlib.sha256(raw.encode()).hexdigest()} figures={len(figures)} offline_targets={len(references)}")
print(staged)
