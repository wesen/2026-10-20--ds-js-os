"""Verify the staged selector scripts with the vendored QuickJS host harness."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import subprocess


def trace(quickjs, output, pair, lane, app, linker, source, reactor, entry):
    fixture = output / f"{lane}-{app}-trace.js"
    encoded = reactor.read_bytes().hex()
    input_js = json.dumps(source.read_text())
    fixture.write_text(
        "const phases = []; let work;\n"
        "globalThis.selectorPhase = phase => phases.push(phase);\n"
        "globalThis.selectorSummary = (cells, comparisons, retained, proof) => "
        "{ if (work) throw Error('duplicate counters'); work={cells, comparisons, retained, proof}; };\n"
        + linker.read_text() + "\n"
        + f"const input = {input_js};\n"
        + f'const reactor = Uint8Array.from("{encoded}".match(/../g), x => parseInt(x,16));\n'
        + f"const output = {entry}(input, reactor);\n"
        + "JSON.stringify({phases, work, bytes:output.length});\n"
    )
    result = output / f"{lane}-{app}-trace.json"
    subprocess.run([quickjs, "lex", pair / "wasm.js", pair / "rv32.js", fixture, result],
                   check=True, capture_output=True)
    return json.loads(result.read_text())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("work", type=Path)
    parser.add_argument("quickjs", type=Path)
    args = parser.parse_args()
    work = args.work.resolve()
    preflight = json.loads((work / "transfer-preflight.json").read_text())
    output = work / "quickjs"
    output.mkdir(exist_ok=True)
    build = work / "build/esp-idf/main"
    dummy = output / "dummy.bin"
    dummy.write_bytes(b"\0")
    inputs = {
        "editor": (work / "tree/picocalc-os/compiler/typed-world.js", build / "editor.typed",
                   build / "typed-world-reactor.elf", "compileTypedWorldRv32"),
    }
    if (work / "synthetic.typed").exists():
        inputs["synthetic"] = (work / "synthetic.js", work / "synthetic.typed",
                               dummy, "compileSelectorSynthetic")
    verified = {}
    for lane, apps in preflight["selection"].items():
        pair = work / "lanes" / lane / "typed"
        verified[lane] = {}
        for app, (linker, source, reactor, entry) in inputs.items():
            artifact = output / f"{lane}-{app}.bin"
            subprocess.run([args.quickjs, "compile", pair / "wasm.js", pair / "rv32.js",
                            linker, source, reactor, entry, artifact], check=True, capture_output=True)
            receipt = apps[app]
            bytes_ = artifact.read_bytes()
            digest = sha256(bytes_).hexdigest()
            assert len(bytes_) == receipt["bytes"] and digest == receipt["sha256"]
            profile = trace(args.quickjs, output, pair, lane, app, linker, source, reactor, entry)
            assert profile["bytes"] == receipt["bytes"]
            assert profile["phases"] == ([4] if lane == "base" else [2, 3, 4])
            for field in ("cells", "retained", "proof"):
                assert profile["work"][field] == receipt["counters"][field]
            assert bool(profile["work"]["comparisons"]) == bool(receipt["counters"]["comparisons"])
            verified[lane][app] = {"sha256": digest, **profile}
    print(json.dumps(verified, indent=2))


if __name__ == "__main__":
    main()
