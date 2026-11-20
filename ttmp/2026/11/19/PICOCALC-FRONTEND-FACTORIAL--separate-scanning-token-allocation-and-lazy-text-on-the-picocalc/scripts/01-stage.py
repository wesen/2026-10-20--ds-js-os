"""Generate the five frontend treatments and isolated ESP32-P4 build trees."""
import argparse
from pathlib import Path
import runpy
import subprocess

HERE = Path(__file__).resolve().parent
DAY = HERE.parent.parent
LAB, = DAY.glob("PICOCALC-COMPILER-LAB--*/scripts")
PREVIOUS, = DAY.glob("PICOCALC-FRONTEND-COLD--*/scripts")
REPO = HERE.parents[5]
LAB_REVISION = "dbe26be"
LAB_FILES = ("01-stage.py", "02-trials.c", "03-oracle.mjs", "04-board.py")
FACTORIAL = ("base", "regex_reuse", "cursor_fresh", "cursor_reuse")
LAZY = ("base", "cursor_reuse", "cursor_lazy")


def replace(source, old, new):
    if source.count(old) != 1:
        raise ValueError(f"expected one staging anchor {old!r}")
    return source.replace(old, new)


def verify_inputs():
    for path in [*(LAB / name for name in LAB_FILES), PREVIOUS / "02-cursor.js.inc"]:
        frozen = subprocess.check_output(
            ["git", "-C", REPO, "show", f"{LAB_REVISION}:{path.relative_to(REPO)}"])
        if frozen != path.read_bytes():
            raise ValueError(f"changed experiment dependency: {path}")


def regex_reused(source):
    source = replace(source, "        this.source = source;\n        this.offset = 0;\n", '''        this.source = source;
        this.offset = 0;
        this.token = { value: "", kind: "eof", at: 0 };
''')
    source = replace(source, '''            this.token = { value, kind: id ? "id" : int ? "int" : str ? "str" : "op",
                at: TOKEN.lastIndex - value.length };''', '''            this.token.value = value;
            this.token.kind = id ? "id" : int ? "int" : str ? "str" : "op";
            this.token.at = TOKEN.lastIndex - value.length;''')
    return replace(source, '''        this.token = { value: "", kind: "eof", at: this.offset };''',
                   '''        this.token.value = "";
        this.token.kind = "eof";
        this.token.at = this.offset;''')


def cursor(source, mode):
    helpers, scanner = (PREVIOUS / "02-cursor.js.inc").read_text().split("\n    next() {", 1)
    old = '''        this.token.at = start;
        this.token.value = source.slice(start, end);
        this.token.kind = kind;'''
    writers = {
        "fresh": "        this.token = { value: source.slice(start, end), kind, at: start };",
        "reuse": '''        this.token.value = source.slice(start, end);
        this.token.kind = kind;
        this.token.at = start;''',
        "lazy": '''        this.token.kind = kind;
        this.token.at = start;
        this.token.end = end;
        this.tokenText = undefined;''',
    }
    scanner = replace(scanner, old, writers[mode])
    source = replace(source, "class Lexer {", helpers + "\nclass Lexer {")
    return replace(source, "    next() {", "    next() {" + scanner + "\n    legacyNext() {")


def lazify(source):
    source = replace(source, 'this.token = { value: "", kind: "eof", at: 0 };',
                     'this.token = { kind: "eof", at: 0, end: 0 };')
    source = replace(source, '''            this.token.value = value;
            this.token.kind = id ? "id" : int ? "int" : str ? "str" : "op";
            this.token.at = TOKEN.lastIndex - value.length;''', '''            this.token.kind = id ? "id" : int ? "int" : str ? "str" : "op";
            this.token.at = TOKEN.lastIndex - value.length;
            this.token.end = TOKEN.lastIndex;
            this.tokenText = undefined;''')
    source = replace(source, '''        this.token.value = "";
        this.token.kind = "eof";
        this.token.at = this.offset;''', '''        this.token.kind = "eof";
        this.token.at = this.offset;
        this.token.end = this.offset;
        this.tokenText = undefined;''')
    methods = (HERE / "02-lazy-parser.js.inc").read_text() + "\n"
    source = replace(source, '''    accept(value) {
        if (this.token.value !== value) return false;''', methods + '''    accept(value) {
        if (!this.is(value)) return false;''')
    source = replace(source, '''        const { value, kind } = this.token;
        if (kind !== "id" || RESERVED.has(value)) this.fail("expected identifier");''',
                     '''        if (this.token.kind !== "id") this.fail("expected identifier");
        const value = this.text();
        if (RESERVED.has(value)) this.fail("expected identifier");''')
    source = replace(source, "        const { value } = this.token;", "        const value = this.text();")
    source = replace(source, "            const op = this.lex.token.value;",
                     "            const op = this.lex.binaryOperator();")
    source = replace(source, 'lex.token.value === "{"', 'lex.is("{")')
    source = replace(source, 'lex.token.value === "const"', 'lex.is("const")')
    if source.count('lex.token.value === "let"') != 2:
        raise ValueError("expected two let probes")
    source = source.replace('lex.token.value === "let"', 'lex.is("let")')
    source = replace(source, 'lex.token.value !== "return"', '!lex.is("return")')
    for consumer, count in (("Number", 2), ("JSON.parse", 1)):
        old = f"{consumer}(lex.token.value)"
        if source.count(old) != count:
            raise ValueError(f"expected {count} {old} consumers")
        source = source.replace(old, f"{consumer}(lex.text())")
    if ".token.value" in source:
        raise ValueError("unhandled eager parser access")
    return source


def stage(work, images):
    verify_inputs()
    lab = runpy.run_path(str(LAB / "01-stage.py"))
    frozen = lab["frozen"]
    base = frozen("picocalc-os/compiler/typed-wasm.js").decode()
    reused = regex_reused(base)
    code = {
        "base": base,
        "regex_reuse": reused,
        "cursor_fresh": cursor(base, "fresh"),
        "cursor_reuse": cursor(reused, "reuse"),
        "cursor_lazy": lazify(cursor(reused, "lazy")),
    }
    backend = frozen("picocalc-os/compiler/typed-rv32.js")
    lane_dirs = {}
    for lane, source in code.items():
        dest = work / "treatments" / lane
        (dest / "typed").mkdir(parents=True, exist_ok=True)
        (dest / "typed/wasm.js").write_bytes(source.encode())
        (dest / "typed/rv32.js").write_bytes(backend)
        lane_dirs[lane] = dest
    for name, lanes in (("factorial", FACTORIAL), ("lazy", LAZY)):
        if name in images:
            lab["stage"](work / name, {lane: lane_dirs[lane] for lane in lanes})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("work", type=Path)
    parser.add_argument("--image", choices=("factorial", "lazy"), action="append")
    args = parser.parse_args()
    stage(args.work.resolve(), args.image or ("factorial", "lazy"))
