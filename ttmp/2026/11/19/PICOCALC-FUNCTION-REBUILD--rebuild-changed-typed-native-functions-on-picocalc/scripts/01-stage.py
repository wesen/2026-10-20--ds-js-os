"""Generate adapters from the frozen compiler and optionally stage an isolated P4 build."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[5]
CONTROL = "40bcf850a5809ef6d839127869faa952596ed157"
OS = REPO / "picocalc-os"


def frozen(path):
    return subprocess.check_output(["git", "-C", REPO, "show", f"{CONTROL}:picocalc-os/{path}"])


def exact(text, old, new):
    if text.count(old) != 1:
        raise ValueError(f"expected one staging anchor {old!r}")
    return text.replace(old, new)


def region(text, start, end):
    if text.count(start) != 1:
        raise ValueError(f"expected one start anchor {start!r}")
    start_at = text.index(start)
    return text[start_at:text.index(end, start_at)]


def add_exports(text, additions):
    if not text.endswith("})();\n"):
        raise ValueError("missing compiler closure terminator")
    return text.removesuffix("})();\n") + additions + "\n})();\n"


def stage(work):
    stock = work / "stock"
    candidate = work / "candidate"
    stock.mkdir(parents=True, exist_ok=True)
    candidate.mkdir(parents=True, exist_ok=True)
    paths = {"wasm.js": "compiler/typed-wasm.js", "rv32.js": "compiler/typed-rv32.js",
             "files.js": "worlds/files/compile.js", "world.js": "compiler/typed-world.js",
             "files.typed": "worlds/files/files.typed"}
    for name, path in paths.items():
        (stock / name).write_bytes(frozen(path))
    front = (stock / "wasm.js").read_text()
    records = region(front, "    const records = new Map();\n    while (lex.accept", "    const functions = [];")
    header = region(front, "    function() {\n", '        lex.expect("{");\n')
    header = exact(header, "    function() {", "    header() {")
    body = region(front, '        lex.expect("{");\n        while (lex.token.value !== "return")', "\n    finish(fn)")
    body = exact(body, '        lex.expect("}");', '        const end = lex.offset;\n        lex.expect("}");')
    body = exact(body, "return this.finish({ name, params, result, code: this.code, nlocals });",
                 "return {name, params, result, code: this.code, nlocals, end};")
    (candidate / "wasm.js").write_text(add_exports(front, f"""
function rebuildRecords(lex) {{
{records}    return records;
}}

class RebuildEmitter extends NumericFunctionEmitter {{
{header}        return {{name, params, result}};
    }}

    body({{name, params, result}}) {{
        const lex = this.lex;
{body}}}

globalThis.rebuildFrontend = {{Lexer, RebuildEmitter, rebuildRecords, recordLayouts}};
"""))
    rv32 = (stock / "rv32.js").read_text()
    (candidate / "rv32.js").write_text(add_exports(rv32,
        "\nglobalThis.rebuildBackend = {FunctionCode, jump: instruction.j, linkSlot};\n"))
    files = (stock / "files.js").read_text()
    (candidate / "files.js").write_text(add_exports(files, """
    globalThis.rebuildFiles = {entries, imports: [], maxSourceLength: 64 * 1024,
        validate: program => validate(program.signatures), clean: compileFilesRv32};
""".replace("clean: compileFilesRv32", "clean: globalThis.compileFilesRv32")))
    world = (stock / "world.js").read_text()
    (candidate / "world.js").write_text(add_exports(world, """
    globalThis.rebuildWorld = {entries, imports, maxSourceLength, validate, clean: globalThis.compileTypedWorldRv32};
"""))
    for name, source in (("incremental.js", "02-incremental.js"), ("cases.js", "03-cases.js")):
        shutil.copyfile(HERE / source, candidate / name)
    manifest = {"revision": CONTROL, "sha256": {
        str(path.relative_to(work)): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted([*stock.iterdir(), *candidate.iterdir()])}}
    (work / "sources.json").write_text(json.dumps(manifest, indent=2) + "\n")


def patch(path, old, new):
    path.write_text(exact(path.read_text(), old, new))


def p4_tree(work):
    tree = work / "tree"
    checkout = tree / "picocalc-os"
    checkout.mkdir(parents=True)
    (tree / "ttmp").symlink_to(REPO / "ttmp")
    for path in OS.iterdir():
        if path.name != "port" and not path.name.startswith("build"):
            (checkout / path.name).symlink_to(path)
    port = checkout / "port/esp32p4"
    port.mkdir(parents=True)
    for path in (OS / "port/esp32p4").iterdir():
        if path.name in {"main", "optional", "compiler", "managed_components"}:
            shutil.copytree(path, port / path.name, symlinks=True)
        elif path.is_file():
            shutil.copyfile(path, port / path.name)
    main = port / "main"
    cmake = main / "CMakeLists.txt"
    patch(cmake, "PRIV_REQUIRES driver", "PRIV_REQUIRES mbedtls driver")
    names = {f"rebuild/{p.name}": p for p in (work / "candidate").iterdir()}
    names.update({f"rebuild/stock-{name}.js": work / "stock" / f"{name}.js"
                  for name in ("wasm", "rv32", "files")})
    bundle = [f'list(APPEND BUNDLE_EXTRA "{key}={path}")' for key, path in names.items()]
    bundle += [f'list(APPEND BUNDLE_EXTRA_DEPS "{path}")' for path in names.values()]
    marker = "set(BUNDLE ${CMAKE_CURRENT_BINARY_DIR}/js_bundle.c)"
    patch(cmake, marker, "\n".join(bundle) + "\n" + marker)
    patch(main / "typed_p4.c", 'eval_file(ctx, "typed/wasm.js")', 'eval_file(ctx, "rebuild/stock-wasm.js")')
    patch(main / "typed_p4.c", 'eval_file(ctx, "typed/rv32.js")', 'eval_file(ctx, "rebuild/stock-rv32.js")')
    patch(main / "files_p4.c", '"files/compile.js"', '"rebuild/stock-files.js"')
    patch(main / "editor_p4.c", 'char *p4_editor_compile', 'char *rebuild_editor_compile')
    with (main / "typed_p4.c").open("a") as stream:
        stream.write("\n" + (HERE / "05-p4.c.inc").read_text())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("work", type=Path)
    parser.add_argument("--p4", action="store_true")
    args = parser.parse_args()
    work = args.work.resolve()
    stage(work)
    if args.p4:
        p4_tree(work)
