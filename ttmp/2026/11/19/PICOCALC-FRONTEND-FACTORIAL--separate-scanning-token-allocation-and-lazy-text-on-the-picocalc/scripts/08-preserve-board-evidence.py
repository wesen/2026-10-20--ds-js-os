"""Preserve just the measured UART records, verified against the board receipt."""
import argparse
import hashlib
import json
from pathlib import Path
import runpy

HERE = Path(__file__).resolve().parent
LAB, = HERE.parent.parent.glob("PICOCALC-COMPILER-LAB--*/scripts/04-board.py")
reader = runpy.run_path(str(LAB))
APPS = set(reader["APPS"])


def extract(path, output):
    data = path.read_bytes()
    lines = []
    runtime_prefixes = tuple(app + " " + kind for app in sorted(APPS)
                             for kind in ("native compiler functions=", "compile source="))
    for line in data.decode(errors="replace").splitlines():
        if line.startswith(("LAB", *runtime_prefixes)):
            lines.append(line)
        elif line.startswith('[{"name":'):
            worlds = [entry for entry in json.loads(line) if entry["name"] in APPS]
            fields = ("name", "engine", "file", "last_error")
            lines.append(json.dumps([{k: world[k] for k in fields} for world in worlds],
                                    separators=(",", ":")))
    body = "\n".join(lines) + "\n"
    output.write_text(body)
    return body, {"captureSha256": hashlib.sha256(data).hexdigest(),
                  "excerptSha256": hashlib.sha256(body.encode()).hexdigest()}


def preserve(work, output):
    receipt = json.loads((work / "physical.json").read_text())
    assert receipt["restored"] and len(receipt["boots"]) == 2
    result = {}
    for i, boot in enumerate(receipt["boots"], 1):
        stem = f"boot-{i}"
        raw = work / (stem + "-complete.log")
        if not raw.exists():
            raw = work / (stem + ".log")
        captured, entry = extract(raw, output / (stem + ".txt"))
        assert reader["parse"](captured, receipt["oracle"], receipt["guest_inputs"]) == boot
        result[stem] = entry
    restored, entry = extract(work / "restored.log", output / "restored.txt")
    assert reader["worlds"](restored) == receipt["restored_worlds"]
    result["restored"] = entry
    (output / "capture-identities.json").write_text(json.dumps(result, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("work", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    preserve(args.work, args.output)


if __name__ == "__main__":
    main()
