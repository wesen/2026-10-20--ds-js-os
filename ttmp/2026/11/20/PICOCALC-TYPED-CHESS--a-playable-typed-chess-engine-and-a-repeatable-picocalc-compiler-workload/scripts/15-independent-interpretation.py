"""Commission a fresh Opus High interpretation with the original design and frozen outcomes."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

TICKET = Path(__file__).resolve().parents[1]
BRIEF = """You are contributing the independent post-experiment interpretation of the PicoCalc Typed
Chess project. Your prior Opus High design is supplied below. Continue from its predictions using
only the verified outcome aggregates. Write for a capable newcomer to the compiler project.

Explain what perft, the move-list tests, two mates in one, the forced quiet mate in two, and the
poisoned-pawn intervention establish separately. Distinguish the one-ply material comparison
from the Wasm-only experiment that disabled only quiet-leaf capture continuations. Explain what
deterministic backend parity proves and what it misses. The UI initially inverted the winner
label because the position stores the losing side to move after checkmate. The corrected app
applies both independent reference mates and checks the actual rendered winner text.

Attribute the host and device times precisely. Host compile results are nine QuickJS process CPU
runs, with compiler loading timed independently. The Node/Wasm event timings exclude scheduler,
compositor and panel. Only one native RV32 exchange was observed on the physical board. Its
compile clock includes bundled input, fresh QuickJS setup, source compilation, module copy and
compiler teardown. The device reply clock begins at delivery of the final Enter to Chess and
ends when the reply frame is retained. The white-frame boundary is measured inside that
interval. World CPU, engine execution and the kernel's retained-frame handling sum over Chess
segments, with app frame generation inside engine time. UART screenshot and factory restoration
are outside the move clock. Keep any timing inference scoped to the supplied samples. There is
no Wasm device result, comparative Elo, or measured transposition table.

Return two distinct Markdown strings. The article should be a standalone explanation with
a numeric evidence table, predictions compared against observed behavior, the measurement
limitations and future experiments appropriate to this result. Include a separate chronological
investigation diary dated 2026-11-20 with the following headings under each substantive step:
Prompt Context, What I did, Why, What worked, What didn't work, What I learned, What was tricky to
build, What warrants a second pair of eyes, What should be done in the future, Code review
instructions, Technical details. Mark analysis of supplied records separately from work executed
by the implementation team. State that you performed interpretation from supplied evidence and
had no execution or file access. Do not invent file contents, checks, readings or decisions.
Use a title in each Markdown string. Write in active voice, keep technical details precise,
avoid semicolons, and avoid decorative introductions."""


def load(name):
    return json.loads((TICKET / "various" / name).read_text())


def evidence():
    original = load("opus-search-design.json")
    physical = load("physical-rv32.json")
    if not physical.get("restored") or physical["build"]["target"] != "rv32":
        raise ValueError("independent interpretation needs a restored physical RV32 receipt")
    engine = load("engine-oracle.json")
    host = load("host-measurements.json")
    world = load("world-oracle.json")
    first_capture = load("physical-first-attempt.json")
    assert host["compile"]["rv32"]["artifact"]["sourceSha256"] == physical["build"]["sourceSha256"]
    assert host["compile"]["rv32"]["artifact"]["moduleBytes"] == physical["compile"]["module_bytes"]
    positions = ("opening", "kiwipete", "castling-through-attack", "en-passant-pinned",
                 "en-passant-legal", "promotion-and-underpromotion", "mate-in-one",
                 "mate-in-one-black", "quiet-mate-in-two", "stalemate", "checkmate", "defended-rook")
    return {
        "originalDesign": original["design"],
        "engine": {"matchedWords": engine["wordsMatched"], "targets": engine["targets"],
                   "rows": [r for r in engine["rows"] if r["name"] in positions],
                   "quietLeafAblation": engine["quietLeafAblation"], "mateLabels": engine["mateLabels"]},
        "linkedWorld": {k: world[k] for k in
                        ("events", "searchSlices", "reply", "targets", "screens",
                         "staleWakeIgnored", "failedWakeLegalFallback")},
        "host": {"targetCompile": {key: {"statistics": result["statistics"],
                                        "moduleBytes": result["artifact"]["moduleBytes"]}
                                   for key, result in host["compile"].items()},
                 "firstMove": host["firstMove"]["statistics"], "samplesPerTarget": 9},
        "physical": {k: physical[k] for k in ("compile", "move", "restored")},
        "firstPhysicalCapture": {k: first_capture[k] for k in
                                 ("successfulCompiles", "worldListFailure", "playStarted", "restored")},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scratch", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.scratch.mkdir(parents=True, exist_ok=True)
    if args.output.exists():
        raise FileExistsError(args.output)
    prompt = BRIEF + "\n\nVERIFIED EVIDENCE\n" + json.dumps(evidence(), indent=2)
    schema = json.dumps({"type": "object", "properties": {"article": {"type": "string"},
                                                          "diary": {"type": "string"}},
                         "required": ["article", "diary"], "additionalProperties": False})
    proc = subprocess.run(["claude", "-p", "--model", "claude-opus-4-6", "--effort", "high",
                           "--tools", "", "--disable-slash-commands", "--setting-sources", "",
                           "--strict-mcp-config", "--no-session-persistence", "--output-format", "json",
                           "--json-schema", schema],
                          input=prompt, text=True, cwd=args.scratch, capture_output=True,
                          timeout=900, check=True)
    raw = json.loads(proc.stdout)
    if isinstance(raw, list):
        raw = next(event for event in reversed(raw) if event.get("type") == "result")
    models = list(raw.get("modelUsage", {}))
    response = raw.get("structured_output", {})
    if raw.get("is_error") or not all(response.get(name) for name in ("article", "diary")) or (
            not any(model.startswith("claude-opus-4-6") for model in models)):
        raise ValueError("expected a completed structured Claude Opus 4.6 report and diary")
    with args.output.open("x") as out:
        json.dump({"models": models, "effort": "high",
                   "promptSha256": hashlib.sha256(prompt.encode()).hexdigest(),
                   "raw": raw}, out, indent=2)
        out.write("\n")


if __name__ == "__main__":
    main()
