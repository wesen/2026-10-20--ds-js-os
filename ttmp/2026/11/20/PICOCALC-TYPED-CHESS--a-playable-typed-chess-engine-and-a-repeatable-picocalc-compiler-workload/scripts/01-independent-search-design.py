"""Request the independent Opus High chess design using a self-contained brief."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess


BRIEF = """Act as the independent chess-engine researcher advising a handheld compiler team. We are building a playable orthodox chess program in a typed JS-like language on ESP32-P4, as our fourth compiler workload. The language rejects recursive call graphs and supports i32, bool, strings, bounded writable buffers and explicit event handlers. Native RV32 and Wasm must implement the same search. Cold compile time, guest search time and user-visible presentation are separate. The engine must play meaningfully above one-ply material. Design explicit-stack iterative deepening alpha-beta with move ordering, quiescence, make/unmake and a deterministic node budget, with a clear rule for interleaving keyboard input. Show precisely how suspension during child search, beta cutoffs, repetition, terminal nodes, en passant legality, promotion, castling, mate distance and in-check leaves affect correctness. Contrast likely useful and premature optimizations. Offer a minimal credible strength experiment against a one-ply material player and held-out tactical positions (use verified moves or name verification methods; never fabricate receipts), standard perft, and how to separate engine strength from work per node. Include a newcomer-facing rationale, pseudocode, a state-transition diagram, an implementable first milestone, primary-paper references identified by author/title, a list of falsifiable predictions, and your own investigation diary. Do not claim to have read or written files, run the program, or performed measurements. Output Markdown directly. You have no tools or filesystem access. Start with the report title."""


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("scratch", type=Path)
    p.add_argument("output", type=Path)
    args = p.parse_args()
    args.scratch.mkdir(parents=True, exist_ok=True)
    if args.output.exists():
        raise FileExistsError(args.output)
    proc = subprocess.run(["claude", "-p", "--model", "claude-opus-4-6", "--effort", "high",
                           "--tools", "", "--disable-slash-commands", "--setting-sources", "",
                           "--strict-mcp-config", "--no-session-persistence", "--output-format", "json"],
                          input=BRIEF, text=True, cwd=args.scratch, capture_output=True,
                          timeout=900, check=True)
    event = json.loads(proc.stdout)
    if isinstance(event, list):
        event = next(row for row in reversed(event) if row.get("type") == "result")
    models = list(event.get("modelUsage", {}))
    if event.get("is_error") or not event.get("result") or not any("opus" in m for m in models):
        raise ValueError("expected a completed Opus research response")
    with args.output.open("x") as out:
        json.dump({"models": models, "effort": "high",
                   "prompt_sha256": hashlib.sha256(BRIEF.encode()).hexdigest(),
                   "design": event["result"]}, out, indent=2)
        out.write("\n")


if __name__ == "__main__":
    main()
