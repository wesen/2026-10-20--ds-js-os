"""Check a production source tree against the replayed checkout and physical firmware receipts."""
import argparse
import hashlib
import json
from pathlib import Path


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path):
    return json.loads(path.read_text())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tree", type=Path)
    parser.add_argument("lane", type=Path, help="rehearsed checkout with candidate images and board results")
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    replay = read(args.lane / "receipt.json")
    board = read(args.lane / "board/physical.json")
    gates = read(args.lane / "board/comparison.json")["gates"]
    if replay["exit"] or len(replay["replays"]) != 24 or not all(row.startswith("PASS ") for row in replay["replays"]):
        raise ValueError("incomplete host replay")
    required = {"rv32_exact_frames", "wasm_exact_frames", "native_cpu_within_10pct",
                "native_compile_within_10pct", "e5_native_within_5pct"}
    if gates.keys() != required or not all(gates.values()):
        raise ValueError("incomplete device qualification")
    if not board["restored"] or set(board["worlds"]) != {"files", "agenda", "editor"}:
        raise ValueError("missing restoration of reference applications")
    images = {engine: digest(args.lane / "fixed-wall" / engine / "picocalc-os-p4.bin")
              for engine in ("rv32", "wasm")}
    if board["images"] != images:
        raise ValueError("tested firmware has changed")
    sources = {path: digest(args.tree / path) for path in replay["sources"]}
    if sources != replay["sources"] or digest(args.lane / "integration.patch") != replay["patch_sha256"]:
        raise ValueError("production compiler differs from qualified sources")
    result = dict(base=replay["base"], lane=replay["lane"], sources=sources, images=images,
                  replay_count=len(replay["replays"]), gates=gates, restored=board["worlds"])
    args.output.write_text(json.dumps(result, indent=2) + "\n")


if __name__ == "__main__":
    main()
