"""Check the research index against its dated ticket corpus and the professor's task list."""
import argparse
import re
import subprocess
from pathlib import Path
from urllib.parse import unquote

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("vault", type=Path, help="local Git checkout of go-go-parc")
vault = parser.parse_args().vault
ticket = Path(__file__).resolve().parents[2]
index, = ticket.glob("reference/02-picocalc-compiler-research-index*.md")
body = index.read_text().split("\n---\n", 1)[1]
month = ticket.parent.parent
corpus = {p.parent for day in ("17", "18", "19")
          for p in (month / day).glob("PICOCALC-*--*/index.md")}
roadmap, = ticket.parent.glob("PICOCALC-NATIVE-NEXT--*")
planned = set(re.findall(r"^- \[[ x]\] ([A-Z]\d+):", (roadmap / "tasks.md").read_text(), re.M))
indexed = re.findall(r"\*\*([A-Z]\d+)\*\*", body)
assert planned and planned == set(indexed) and len(indexed) == len(planned), "task coverage changed"

files = set()
vault_paths = set()
for destination in re.findall(r"\[[^\]\n]+\]\(([^)\n]+)\)", body):
    if destination.startswith("https://"):
        prefix = "https://github.com/go-go-golems/go-go-parc/blob/"
        assert destination.startswith(prefix), destination
        revision, path = unquote(destination[len(prefix):]).split("/", 1)
        subprocess.run(["git", "-C", vault, "cat-file", "-e", revision + ":" + path], check=True)
        vault_paths.add(path)
    else:
        path = (index.parent / destination).resolve()
        assert path.is_file(), path
        files.add(path)

missing = {t.name for t in corpus if not any(t in path.parents for path in files)}
assert not missing, sorted(missing)
print(f"{len(planned)} roadmap task IDs, {len(corpus)} dated tickets, "
      f"{len(files)} workspace documents, {len(vault_paths)} pinned vault documents verified.")
