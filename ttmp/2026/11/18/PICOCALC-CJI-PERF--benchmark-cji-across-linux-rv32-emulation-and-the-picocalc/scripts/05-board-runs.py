"""Run controlled P4 heap checks sequentially on an already-flashed profile build."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("out", type=Path)
parser.add_argument("cases", nargs="+", help="WORLD:MIB, collected in supplied order")
parser.add_argument("--board-condition", required=True, help="observed or intentionally established operating condition")
parser.add_argument("--firmware-elf", type=Path, required=True, help="exact ELF corresponding to the flashed app")
args = parser.parse_args()
args.out.mkdir(parents=True, exist_ok=True)
ticket = next(Path("ttmp/2026/11/17").glob("*PORT--*/various/device-catalog-results.json"))
catalog = {w["world"]: w for w in json.loads(ticket.read_text())["worlds"]}
checker = ticket.parents[1] / "scripts/07-check-bundled-catalog.py"
firmware = hashlib.sha256(args.firmware_elf.read_bytes()).hexdigest()
for case in args.cases:
    world, mib = case.split(":")
    expected = catalog[world]
    stem = f"{world}-{mib}"
    # Preserve earlier samples and unsuccessful attempts on retry.
    ordinal = 1
    while (args.out / f"{stem}-{ordinal}.log").exists():
        ordinal += 1
    log = args.out / f"{stem}-{ordinal}.log"
    receipt = args.out / f"{stem}-{ordinal}.jsonl"
    with log.open("x") as stderr, receipt.open("x") as stdout:
        subprocess.run([sys.executable, str(checker), "--profile-heap", mib, "--timeout", "10800", world],
                       stdout=stdout, stderr=stderr, check=True)
    row = json.loads(receipt.read_text())
    metrics = row.get("metrics", {})
    if (row["result"] != "ok" or row["source_sha256"] != expected["source_sha256"]
            or row["elf_sha256"] != expected["host_elf_sha256"] or not metrics.get("complete")
            or row["frontend_reserved_bytes"] != int(mib) * 1024**2
            or not 0 <= metrics["gc_us"] <= metrics["frontend_us"] <= row["elapsed_ms"] * 1000 + 999):
        raise ValueError(f"run failed qualification: {receipt}")
    with (args.out / "p4-runs.jsonl").open("a") as summaries:
        print(json.dumps(dict(suite="frontend",target="esp32-p4",ordinal=ordinal,firmware_sha256=firmware,
                              condition=args.board_condition,raw_log=log.name,verified=True,**row)),file=summaries)
    print(f"{case} passed, {metrics['frontend_us']} us frontend", flush=True)
