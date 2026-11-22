#!/usr/bin/env python3
"""Phase A (host part): promote the host gates out of the tickets into bench/.

usage: python3 01-promote-host-gates.py        (from anywhere inside the repository; runs once)

- The 24-workflow replay suite: 13 scripts and 4 helpers from TYPED-APPS, AGENDA-COMPILER, TYPED-WORLDS and
  RAY-PARITY are copied to bench/host/replays/ under descriptive names. Their compiler imports become one import of
  bench/lib/compiler.mjs (which also applies TYPED_RV32_OPTIONS); helper names are updated where a script names them.
- The Chess engine oracle (RAY-PARITY 05, itself TYPED-CHESS 03 plus options and instruction counts) becomes
  bench/host/chess-engine.mjs; its runner and reference positions come from TYPED-CHESS.
- tools/typed-ray-profile.mjs moves (git mv) to bench/host/ray-profile.mjs; OPENING_DIGEST moves to
  bench/reference/ray-opening.json; --policy accepts any named policy.
- cji/tools/rv32/emu.c moves (git mv) to bench/emu/emu.c; cji's Makefile builds its rv32emu from there.
- SIMD-LAB's twelve frame fixtures are copied to bench/reference/ray-frame-fixtures.json for the board harness.
Every copied file starts with a line naming its source ticket file.
"""
import glob
import json
import re
import subprocess
from pathlib import Path

REPO = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True).stdout.strip())
T = lambda day, ticket: Path(glob.glob(str(REPO / "ttmp/2026/11" / day / (ticket + "--*")))[0])
APPS, AGENDA = T("18", "PICOCALC-TYPED-APPS") / "scripts", T("18", "PICOCALC-AGENDA-COMPILER") / "scripts"
WORLDS, PARITY = T("18", "PICOCALC-TYPED-WORLDS") / "scripts", T("21", "PICOCALC-RAY-PARITY") / "scripts"
CHESS, SIMD = T("20", "PICOCALC-TYPED-CHESS"), T("21", "PICOCALC-SIMD-LAB")
BENCH = REPO / "bench"
COMPILER_IMPORT = re.compile(r"^import '(?:\.\./)+picocalc-os/compiler/typed-[a-z0-9-]+\.js';\n", re.M)


def provenance(src, comment):
    rel = src.relative_to(REPO)
    ticket = rel.parts[4].split("--")[0]
    return comment.format(f"Promoted from {ticket} {'/'.join(rel.parts[5:])} (PICOCALC-REPO-LAYOUT Phase A); run from the repository root.")


def copy_script(src, dest, lib, edits=()):
    text = src.read_text()
    imports = COMPILER_IMPORT.findall(text)
    if imports:
        at = text.index(imports[0])
        text = COMPILER_IMPORT.sub("", text)
        text = text[:at] + f"import '{lib}/compiler.mjs';\n" + text[at:]
    for old, new in edits:
        assert text.count(old) == 1, (src.name, old)
        text = text.replace(old, new)
    if src.suffix == ".mjs":
        assert "../picocalc-os/compiler/" not in text, (src.name, "a relative compiler import was left")
    comment = "// {}\n" if src.suffix in (".mjs", ".js") else "/* {} */\n"
    dest.write_text(provenance(src, comment) + text)
    return dest


def main():
    replays = BENCH / "host/replays"
    plan = [
        (APPS / "01-check-files-wasm.mjs", "files-wasm.mjs", ()),
        (APPS / "02-check-files-rv32.mjs", "files-rv32.mjs", ()),
        (APPS / "07-check-editor-layout.mjs", "editor-layout.mjs", ()),
        (AGENDA / "01-check-calendar.mjs", "agenda-calendar.mjs", ()),
        (AGENDA / "02-check-leads.mjs", "agenda-leads.mjs", ()),
        (AGENDA / "03-check-task-records.mjs", "agenda-task-records.mjs", ()),
        (AGENDA / "04-check-wasm-world.mjs", "agenda-wasm-world.mjs", ()),
        (AGENDA / "07-check-rv32-parser.mjs", "agenda-rv32-parser.mjs", (("'06-rv32-runner.c'", "'agenda-rv32-runner.c'"),)),
        (AGENDA / "06-rv32-runner.c", "agenda-rv32-runner.c", ()),
        (AGENDA / "14-check-local-inference.mjs", "agenda-local-inference.mjs", ()),
        (AGENDA / "16-check-entry-tokens.mjs", "agenda-entry-tokens.mjs", ()),
        (AGENDA / "agenda-lines.mjs", "agenda-lines.mjs", ()),
        (WORLDS / "01-check-editor-empty-view.mjs", "editor-empty-view.mjs", ()),
        (PARITY / "04-check-editor-world.mjs", "editor-world.mjs",
         (("new URL('04-libgcc-helpers.c', import.meta.url)", "new URL('libgcc-helpers.c', import.meta.url)"),
          ("new URL('04-editor-world-driver.c', import.meta.url)", "new URL('editor-world-driver.c', import.meta.url)"))),
        (PARITY / "04-editor-world-driver.c", "editor-world-driver.c", ()),
        (PARITY / "04-libgcc-helpers.c", "libgcc-helpers.c", ()),
    ]
    for src, name, edits in plan:
        copy_script(src, replays / name, "../../lib", edits)

    # The Chess engine oracle: fixtures and runner beside it, options through bench/lib/compiler.mjs.
    (BENCH / "reference/chess/reference-positions.json").write_bytes((CHESS / "various/reference-positions.json").read_bytes())
    copy_script(CHESS / "scripts/04-engine-rv32-runner.c", BENCH / "host/chess-engine-runner.c", "../lib")
    copy_script(PARITY / "05-chess-engine-oracle.mjs", BENCH / "host/chess-engine.mjs", "../lib", (
        ("const ticket = resolve(dirname(fileURLToPath(import.meta.url)), '../../../20/PICOCALC-TYPED-CHESS--a-playable-typed-chess-engine-and-a-repeatable-picocalc-compiler-workload');",
         "const bench = resolve(dirname(fileURLToPath(import.meta.url)), '..');"),
        ("join(ticket, 'various/reference-positions.json')", "join(bench, 'reference/chess/reference-positions.json')"),
        ("join(ticket, 'scripts/04-engine-rv32-runner.c')", "join(bench, 'host/chess-engine-runner.c')"),
    ))

    # The ray profile: moved, not copied (nothing else imports it).
    (BENCH / "reference/ray-opening.json").write_text(json.dumps({
        "sha256": "430f0d5016593f5b5232593107f198e92f6ecdfd88c946b59d0af364e2117625",
        "what": "SHA-256 of guest memory after typedRayFrame on the opening fixture; the C-verified opening frame recorded by "
                "PICOCALC-SHADOW-CODEGEN and PICOCALC-OPERAND-HOMES. Every compile policy must reproduce it."}, indent=1) + "\n")
    subprocess.run(["git", "mv", "picocalc-os/tools/typed-ray-profile.mjs", "bench/host/ray-profile.mjs"], cwd=REPO, check=True)
    p = BENCH / "host/ray-profile.mjs"
    s = p.read_text()
    for old, new in [
        ("//   node tools/typed-ray-profile.mjs                      # stock and default, table\n"
         "//   node tools/typed-ray-profile.mjs --policy default --json out.json\n"
         "//   node tools/typed-ray-profile.mjs --options '{\"operandLocations\":{\"homes\":true}}'\n",
         "//   node bench/host/ray-profile.mjs                       # stock, default and kernel, table\n"
         "//   node bench/host/ray-profile.mjs --policy kernel --json out.json\n"
         "//   node bench/host/ray-profile.mjs --options '{\"policy\":\"kernel\",\"operandLocations\":{\"reuseArgs\":false}}'\n"),
        ("// equals OPENING_DIGEST, the digest recorded by the PICOCALC-SHADOW-CODEGEN and\n// PICOCALC-OPERAND-HOMES profilers for the C-verified opening frame.\n",
         "// equals OPENING_DIGEST (bench/reference/ray-opening.json), the digest recorded by the\n// PICOCALC-SHADOW-CODEGEN and PICOCALC-OPERAND-HOMES profilers for the C-verified opening frame.\n"),
        ('const root = new URL("..", import.meta.url);\nfor (const file of ["compiler/typed-wasm.js", "compiler/typed-rv32.js", "tools/rv32-interp.js", "tools/typed-ray-bench.js"])',
         'const root = new URL("../../", import.meta.url);\nfor (const file of ["picocalc-os/compiler/typed-wasm.js", "picocalc-os/compiler/typed-rv32.js", "picocalc-os/tools/rv32-interp.js", "picocalc-os/tools/typed-ray-bench.js"])'),
        ('export const OPENING_DIGEST = "430f0d5016593f5b5232593107f198e92f6ecdfd88c946b59d0af364e2117625";\nconst POLICIES = {\n    stock: {policy: "stock"},\n    default: {},\n};\n',
         'export const OPENING_DIGEST = JSON.parse(readFileSync(new URL("../reference/ray-opening.json", import.meta.url))).sha256;\n'
         'const POLICIES = {stock: {policy: "stock"}, default: {}, kernel: {policy: "kernel"}};\n'),
        ('    option("--policy") ? {[option("--policy")]: POLICIES[option("--policy")]} : POLICIES;',
         '    option("--policy") ? {[option("--policy")]: {policy: option("--policy")}} : POLICIES;'),
        ('const source = readFileSync(new URL("worlds/raytrace/raytrace.typed", root), "utf8");',
         'const source = readFileSync(new URL("picocalc-os/worlds/raytrace/raytrace.typed", root), "utf8");'),
    ]:
        assert s.count(old) == 1, old[:60]
        s = s.replace(old, new)
    p.write_text(s)

    # The emulator: one home outside cji.
    subprocess.run(["git", "mv", "cji/tools/rv32/emu.c", "bench/emu/emu.c"], cwd=REPO, check=True)
    mk = REPO / "cji/Makefile"
    s = mk.read_text()
    assert s.count("$(RV32)/rv32emu: tools/rv32/emu.c") == 1
    mk.write_text(s.replace("$(RV32)/rv32emu: tools/rv32/emu.c", "$(RV32)/rv32emu: ../bench/emu/emu.c"))
    for f in subprocess.run(["git", "grep", "-l", "tools/rv32/emu.c", "--", "cji"], cwd=REPO, capture_output=True, text=True).stdout.split():
        q = REPO / f
        q.write_text(q.read_text().replace("tools/rv32/emu.c", "bench/emu/emu.c"))

    (BENCH / "reference/ray-frame-fixtures.json").write_bytes((SIMD / "various/director/frame-fixtures.json").read_bytes())
    print("promoted", len(plan), "replay files, the Chess oracle, the ray profile, the emulator and the frame fixtures")


if __name__ == "__main__":
    main()
