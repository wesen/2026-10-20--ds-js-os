"""Verify the staged selector scripts with the vendored QuickJS host harness."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import subprocess


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
            verified[lane][app] = digest
    print(json.dumps(verified, indent=2))


if __name__ == "__main__":
    main()
