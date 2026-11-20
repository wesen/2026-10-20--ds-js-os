"""Give the Chess world an exact, counted copy of its painter source."""

import argparse
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    raw = args.source.read_bytes()
    if not raw or len(raw) > 16384 or b"\0" in raw or not raw.isascii():
        parser.error("the painter must be nonempty ASCII, without NUL, within 16 KiB")
    source = raw.decode("ascii")
    lines = ["function chessPainterSource(out: buffer): i32 {"]
    # The typed frontend permits at most 1022 units in a writeLiteral call.
    for index in range(0, len(source), 1022):
        lines.append(f"    out.writeLiteral({index}, {json.dumps(source[index:index + 1022])});")
    lines += [f"    return {len(source)};", "}", ""]
    args.output.write_text("\n".join(lines), encoding="ascii")


if __name__ == "__main__":
    main()
