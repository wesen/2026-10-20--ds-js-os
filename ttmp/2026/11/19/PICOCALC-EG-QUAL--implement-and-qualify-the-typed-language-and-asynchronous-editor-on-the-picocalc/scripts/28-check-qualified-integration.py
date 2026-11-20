"""Check a production source tree against the replayed checkout and physical firmware receipts."""
import argparse
import hashlib
import json
import re
import runpy
from pathlib import Path


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path):
    return json.loads(path.read_text())


def full_acceptance(tree, lane, sources):
    parser_ticket, = (tree / "ttmp/2026/11/20").glob("PICOCALC-PARSER-DISPATCH--*")
    evidence = parser_ticket / "various/professor-bounded"
    hashes = {name: sha for sha, name in (line.split(maxsplit=1) for line in
              (evidence / "inputs.sha256").read_text().splitlines())}
    if sources["picocalc-os/compiler/typed-wasm.js"] != hashes["composed-portable/typed-wasm.js"]:
        raise ValueError("measured frontend differs from selected portable compiler")
    issue, = (tree / "ttmp/2026/11/19").glob("PICOCALC-COMPILER-ISSUE--*")
    for ext in ("c", "js"):
        if digest(issue / f"scripts/04-compile-phase-timing.{ext}") != hashes[f"professor.{ext}"]:
            raise ValueError("historical timing harness differs from measured harness")
    samples = []
    for line in (evidence / "portable-reference-wall.jsonl").read_text().splitlines():
        row = json.loads(line)
        if row["lane"] == "composed-portable":
            if row["C_index_registered"] or row["clock"] != "CLOCK_MONOTONIC":
                raise ValueError("expected portable unmodified wall timing")
            matched = re.search(r"^frontend only:.*?: median ([0-9.]+) ms .*15 runs", row["stdout"], re.M)
            if not matched:
                raise ValueError("missing historical frontend median")
            samples.append(float(matched.group(1)))
    if len(samples) != 6 or max(samples) > 31.4:
        raise ValueError("historical frontend gate failed")
    catalog = json.loads((evidence / "dispatch-parity.jsonl").read_text().splitlines()[0])
    if "composed-portable" not in catalog["lanes"] or catalog["fields"] > 71:
        raise ValueError("accepted static state layout absent")
    reader = runpy.run_path(str(Path(__file__).with_name("16-compare-search.py")))["read"]
    pre_hash, before = reader(lane.parent / "pre-g/search")
    post_hash, after = reader(lane / "search")
    if pre_hash != post_hash or before.keys() != after.keys() or len(after) != 6:
        raise ValueError("expected six physical search pairs on the same input")
    for key, observed in after.items():
        expected = before[key]
        for metric in ("query", "settlements", "editor_segments"):
            if observed[metric] != expected[metric]:
                raise ValueError(f"search trace differs at {key} for {metric}")
    search = read(lane / "search/physical.json")
    for trial in search["trials"]:
        if digest(lane / "observer" / trial["engine"] / "picocalc-os-p4.bin") != trial["image"]:
            raise ValueError("search firmware differs from recorded image")
    return dict(frontend_ms=samples, state_fields=catalog["fields"], search_pairs=len(after),
                document_sha256=post_hash, wasm_sha256=catalog["wasm"], elf_sha256=catalog["elf"])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tree", type=Path)
    parser.add_argument("lane", type=Path, help="rehearsed checkout with candidate images and board results")
    parser.add_argument("output", type=Path)
    parser.add_argument("--final", action="store_true", help="also qualify the historical host and full 64 KiB Find gates")
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
    if args.final:
        result["full_acceptance"] = full_acceptance(args.tree, args.lane, sources)
    args.output.write_text(json.dumps(result, indent=2) + "\n")


if __name__ == "__main__":
    main()
