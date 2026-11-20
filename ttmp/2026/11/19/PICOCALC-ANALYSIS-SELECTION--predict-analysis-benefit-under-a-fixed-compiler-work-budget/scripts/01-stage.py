"""Expose the unchanged bounded divisor proof through explicit experiment admissions."""
import argparse
import hashlib
import json
from pathlib import Path
import runpy
import subprocess

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[5]
PREVIOUS, = HERE.parent.parent.glob("PICOCALC-BOUNDED-FACTS--*/scripts")
REVISION = "40bcf850a5809ef6d839127869faa952596ed157"
LAB_REVISION = "dbe26be439802540c8bedcf814198720f3822200"


def stage(work):
    def git(*args):
        return subprocess.check_output(["git", "-C", REPO, *args])

    def pinned(path):
        return git("show", f"{REVISION}:picocalc-os/{path}")

    for name in ("01-stage.py", "02-divisor-facts.js"):
        path = PREVIOUS / name
        if git("show", f"{LAB_REVISION}:{path.relative_to(REPO)}") != path.read_bytes():
            raise ValueError(f"frozen proof dependency changed: {path}")
    proof_stage = runpy.run_path(str(PREVIOUS / "01-stage.py"))
    replace = proof_stage["replace"]
    wasm = proof_stage["frontend"](pinned("compiler/typed-wasm.js").decode())
    rv32 = proof_stage["backend"](pinned("compiler/typed-rv32.js").decode(), "select",
                                  (PREVIOUS / "02-divisor-facts.js").read_text())
    rv32 = replace(rv32, "    let remainingFacts = FACT_MODULE_BUDGET;",
                   "    let remainingFacts = options?.budget ?? FACT_MODULE_BUDGET;")
    rv32 = replace(rv32, """        const admitted = cells <= FACT_FUNCTION_CAP &&
            (FACT_POLICY === "always" || (fn.hasDivision && charge <= remainingFacts));""",
                   """        const mode = options?.mode ?? "source";
        const allowed = mode === "all" || charge <= remainingFacts &&
            (mode === "source" && fn.hasDivision || mode === "ranked" && options.selected.has(fn.name));
        const admitted = cells <= FACT_FUNCTION_CAP && allowed;""")
    rv32 = replace(rv32, '            if (FACT_POLICY === "select") remainingFacts -= charge;',
                   '            if (mode !== "all") remainingFacts -= charge;')
    rv32 = replace(rv32, 'const FACT_POLICY = "select";\n', '')
    rv32 = replace(rv32, 'globalThis.typedRv32 =',
                   'globalThis.SelectionCursor = NumericCursor;\nglobalThis.typedRv32 =')
    inputs = {
        "wasm.js": wasm.encode(), "rv32.js": rv32.encode(),
        "typed-world.js": pinned("compiler/typed-world.js"),
        "files.js": pinned("worlds/files/compile.js"),
        "agenda.js": pinned("worlds/agenda/compile.js"),
    }
    work.mkdir(parents=True, exist_ok=True)
    for name, content in inputs.items():
        (work / name).write_bytes(content)
    (work / "selection-overlay.json").write_text(json.dumps({
        "revision": REVISION,
        "digests": {name: hashlib.sha256(content).hexdigest() for name, content in inputs.items()},
    }, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("overlays", type=Path)
    stage(parser.parse_args().overlays.resolve())
