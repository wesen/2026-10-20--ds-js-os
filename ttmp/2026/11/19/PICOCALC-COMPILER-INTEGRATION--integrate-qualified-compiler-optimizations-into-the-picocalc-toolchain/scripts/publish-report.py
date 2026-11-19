"""Copy the release article and its device screenshot into the dated Obsidian vault folder."""
import argparse
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("vault", type=Path)
vault = parser.parse_args().vault
ticket = Path(__file__).resolve().parents[1]
directory = vault / "Projects/2026/11/19"
assets = directory / "_assets/picocalc-compiler-production"
note = directory / "PROJECT REPORT - PicoCalc Compiler - Production Numeric Operands and Streaming.md"
shot = "production-editor-preview.png"
text = (ticket / "various/production-report.md").read_text()
assert "HARDWARE_RESULTS" not in text
text = text.replace(f"]({shot})", f"](_assets/picocalc-compiler-production/{shot})")
for title in ("Numeric Operands on the Physical ESP32-P4", "Function Representations and Streaming"):
    text = text.replace(f"*{title}*", f"[[PROJECT REPORT - PicoCalc Compiler - {title}|{title}]]")
files = {note: text.encode(), assets / shot: (ticket / "various" / shot).read_bytes()}
for path, data in files.items():
    if path.exists() and path.read_bytes() != data:
        raise FileExistsError(path)
assets.mkdir(exist_ok=True, parents=True)
for path, data in files.items():
    if not path.exists():
        path.write_bytes(data)
    print(path)
