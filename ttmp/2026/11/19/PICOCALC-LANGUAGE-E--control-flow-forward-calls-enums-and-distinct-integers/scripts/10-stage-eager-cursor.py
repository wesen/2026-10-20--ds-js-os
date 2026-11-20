#!/usr/bin/env python3
"""Adapt the studied eager cursor to frozen typed compiler snapshots."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
COMPILER = Path("picocalc-os/compiler")
EDITOR = Path("picocalc-os/worlds/editor")
CURSOR, = HERE.parent.parent.glob("PICOCALC-FRONTEND-COLD--*/scripts/02-cursor.js.inc")
SCANNER_REVISION = "dbe26be"
SCANNER_SHA = "98cc842b0da048ddb19bf745103dceed3c3ae0625ed7b3447134e392b90786fb"
PRE_G = "13575450d0cd405db2861a8e6e5fecbcbd9904d6"
G4 = "2e4fee184dd56de92cc090d97128011acdc961c7"


def read(rev, path):
    return subprocess.check_output(["git", "-C", ROOT, "show", f"{rev}:{path}"])


def change(source, old, new):
    if source.count(old) != 1:
        raise ValueError(f"expected one staging anchor: {old[:120]!r}")
    return source.replace(old, new, 1)


def cursor(source, historical):
    lexer = read(SCANNER_REVISION, CURSOR.relative_to(ROOT))
    if hashlib.sha256(lexer).hexdigest() != SCANNER_SHA:
        raise ValueError("different historical cursor")
    helpers, scanner = lexer.decode().split("\n    next() {", 1)
    helpers = change(helpers,
        "    case 33: case 37: case 40: case 41: case 42: case 43: case 44: case 45:",
        """    case 33:
        return source.charCodeAt(at + 1) === 61 && source.charCodeAt(at + 2) === 61 ? 3 : 1;
    case 37: case 40: case 41: case 42: case 43: case 44: case 45:""")
    if historical:
        # This revision's regex receives a truncated view of the original source.
        scanner = change(scanner, "const source = this.source;", "const source = this.input;")
    else:
        # G4 tests the limit after matching against the full original source.
        # Keep that rule even when a bounded view ends halfway through a token.
        scanner = change(scanner, "while (start < source.length) {", "while (start < this.end) {")
        scanner = change(scanner, "        let end = start;", """        if (start >= this.end) return this.legacyNext();
        let end = start;""")
        scanner = change(scanner, "if (end === start)", "if (end === start || end > this.end)")
    source = change(source, "class Lexer {", helpers + "\nclass Lexer {")
    source = change(source, "        this.offset = start;\n",
        '        this.offset = start;\n        this.token = { value: "", kind: "eof", at: start };\n')
    source = change(source, "    next() {", "    next() {" + scanner + "\n    legacyNext() {")
    source = change(source, '''            this.token = { value, kind: id ? "id" : int ? "int" : str ? "str" : "op",
                at: TOKEN.lastIndex - value.length };''', '''            this.token.value = value;
            this.token.kind = id ? "id" : int ? "int" : str ? "str" : "op";
            this.token.at = TOKEN.lastIndex - value.length;''')
    if not historical:
        source = change(source, '''            this.token = {value: "", kind: "eof", at: this.offset};''',
            '''            this.token.value = "";
            this.token.kind = "eof";
            this.token.at = this.offset;''')
    return change(source, '''        this.token = { value: "", kind: "eof", at: this.offset };''',
        '''        this.token.value = "";
        this.token.kind = "eof";
        this.token.at = this.offset;''')


def retained_async_tokens(source):
    # The normal parser uses the mutable token until its next advance; async
    # analysis retains a range of stable snapshots, including its old end field.
    return change(source, '''        lex.token.end = lex.offset;
        tokens.push(lex.token);''', '''        const {value, kind, at} = lex.token;
        tokens.push({value, kind, at, end: lex.offset});''')


def stage(directory, revision, historical, use_cursor):
    directory.mkdir(parents=True, exist_ok=True)
    names = ["typed-wasm.js", "typed-rv32.js", "typed-world.js"]
    if not historical:
        names.append("typed-async.js")
    files = {}
    for name in names:
        raw = read(revision, COMPILER / name)
        if use_cursor and name == "typed-wasm.js":
            raw = cursor(raw.decode(), historical).encode()
        if use_cursor and name == "typed-async.js":
            raw = retained_async_tokens(raw.decode()).encode()
        (directory / name).write_bytes(raw)
        files[name] = hashlib.sha256(raw).hexdigest()
    names = read(revision, EDITOR / "source.list").decode().splitlines()
    source = b"".join(read(revision, EDITOR / name) + b"\n" for name in names)
    (directory / "editor.typed").write_bytes(source)
    files["editor.typed"] = hashlib.sha256(source).hexdigest()
    return {"revision": revision, "files": files}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    if args.output.resolve().is_relative_to(ROOT):
        parser.error("write only to a staging directory outside the source checkout")
    lanes = {}
    for label, revision in [("pre-g", PRE_G), ("g4", G4)]:
        for suffix, use_cursor in [("-regex", False), ("-cursor", True)]:
            lane = label + suffix
            lanes[lane] = stage(args.output / lane, revision, label == "pre-g", use_cursor)
    print(json.dumps({"sourceScanner": {"revision": SCANNER_REVISION, "sha256": SCANNER_SHA}, "lanes": lanes}, indent=2))


if __name__ == "__main__":
    main()
