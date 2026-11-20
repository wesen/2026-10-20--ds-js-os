#!/usr/bin/env python3
"""Stage exact typed grammar changes for the professor's frontend-only timer."""

import argparse
import re
from pathlib import Path
import subprocess


def swap(source, before, after):
    if source.count(before) != 1:
        raise ValueError("expected one compiler anchor: " + before[:110])
    return source.replace(before, after, 1)


def parser(source):
    source = swap(source, """    expect(value) {
        if (!this.accept(value)) this.fail("expected " + value);
    }""", """    expect(value) {
        if (this.token.value !== value) this.fail("expected " + value);
        this.next();
    }""")
    source = swap(source, "const BINARY = new Map([", "const BINARY = Object.assign(Object.create(null), Object.fromEntries([")
    source = swap(source, "]);\nconst TOKEN =", "]));\nconst TOKEN =")
    source = swap(source, "const rule = BINARY.get(op);", "const rule = BINARY[op];")
    source = swap(source, "const [precedence, input, result, opcode] = rule;",
        "const precedence = rule[0], input = rule[1], result = rule[2], opcode = rule[3];")

    start = source.index("        const lex = this.lex;", source.index("    statement(result) {"))
    end = source.index('        lex.expect(";");\n    }', source.index("                this.assignment(id, true);", start))
    source = source[:start] + """        const lex = this.lex;
        switch (lex.token.value) {
        case "if":
            lex.next();
            this.conditional(result);
            return;
        case "match":
            lex.next();
            this.match(result);
            return;
        case "return":
            this.result(result, true);
            return;
        case "while":
            lex.next();
            this.loop(result, false);
            return;
        case "for":
            lex.next();
            this.loop(result, true);
            return;
        case "break": {
            lex.next();
            const exit = this.loopExits.at(-1);
            if (exit === undefined) lex.fail("break outside a loop");
            lex.expect(";");
            this.emitIndex(0x0c, this.controls - exit - 1);
            return;
        }
        case "const": case "let":
            this.declaration();
            break;
        default: {
            const id = lex.ident();
            if (lex.accept("(")) {
                this.call(id);
                this.code.push(0x1a); // drop the unused call result
            } else {
                this.assignment(id, true);
            }
        }
        }
""" + source[end:]
    source = swap(source, """        if (!binding) lex.fail("unknown local " + name);
        if (this.records.has(binding.type) && lex.accept(".")) {""", """        if (!binding) lex.fail("unknown local " + name);
        if (binding.type === "i32" || binding.type === "bool") {
            this.emitIndex(OP.get, binding.index);
            return binding.type;
        }
        if (this.records.has(binding.type) && lex.accept(".")) {""")
    return swap(source, """        const body = [...locals, ...fn.code];
        fn.body = [...unsigned(body.length), ...body];""",
        """        fn.body = unsigned(locals.length + fn.code.length).concat(locals, fn.code);""")


def compact_token_match(source, borrow_expression):
    line, = [line for line in source.splitlines() if line.startswith("const TOKEN = ")]
    compact_pattern = line.replace("(?:(?<id>", "((?:", 1)
    for kind in ("int", "str", "op"):
        compact_pattern = compact_pattern.replace("(?<" + kind + ">", "(?:", 1)
    if "(?<" in compact_pattern or compact_pattern == line:
        raise ValueError("unexpected tokenizer captures")
    source = swap(source, line, compact_pattern)
    return swap(source, """            const {id, int, str, op} = match.groups;
            const value = id ?? int ?? str ?? op;
            this.token = { value, kind: id ? "id" : int ? "int" : str ? "str" : "op",
                at: TOKEN.lastIndex - value.length };""", """            const value = match[1];
            const first = value.charCodeAt(0);
            const id = first === 95 || (first >= 65 && first <= 90) || (first >= 97 && first <= 122);
            const kind = id ? "id" : first >= 48 && first <= 57 ? "int" : first === 34 ? "str" : "op";
            const at = TOKEN.lastIndex - value.length;
            const current = """ + borrow_expression + """;
            if (current) {
                current.value = value;
                current.kind = kind;
                current.at = at;
                this.token = current;
            } else {
                this.token = {value, kind, at};
            }""")


def compact(source):
    source = compact_token_match(source, "this.current")
    source = swap(source, """    constructor(source, start = 0, end = source.length) {
        this.source = source;
        this.offset = start;
        this.end = end;
        this.next();""", """    constructor(source, start = 0, end = source.length, borrow = false) {
        this.source = source;
        this.offset = start;
        this.end = end;
        this.current = borrow ? {value: "", kind: "eof", at: start} : null;
        this.next();""")
    return swap(source, "    const lex = new Lexer(source);",
        "    const lex = new Lexer(source, 0, source.length, true);")


def compact_index_fallback(source):
    source = compact_token_match(source, "this.borrowCurrent ? this.token : null")
    return swap(source, """        const index = indexFor(source);
        if (index) {""", """        const index = indexFor(source);
        if (!index && borrowCurrent) {
            this.borrowCurrent = true;
            this.token = {value: "", kind: "eof", at: start};
        }
        if (index) {""")


def table_cursor(source):
    template = Path(__file__).with_name("06-table-cursor.js.inc").read_text()
    table, scan = template.split("\n    scanCurrent() {", 1)
    source = swap(source, "class Lexer {", table + "\nclass Lexer {")
    source = swap(source, "constructor(source, start = 0, end = source.length) {",
        "constructor(source, start = 0, end = source.length, borrow = false) {")
    source = swap(source, """        this.end = end;
        this.next();
    }

    next() {""", """        this.end = end;
        if (borrow && start === 0 && end === source.length) {
            this.token = {value: "", kind: "eof", at: start};
            this.next = this.scanCurrent;
        }
        this.next();
    }

    scanCurrent() {""" + scan + "\n    next() {")
    return swap(source, "    const lex = new Lexer(source);",
        "    const lex = new Lexer(source, 0, source.length, true);")


def direct(source):
    # All substitutions are literal sites and preserve the same consuming
    # advance and the same SyntaxError for an unexpected token.
    source = re.sub(r'(?<![\w.])((?:this\.)?lex)\.accept\(("[^"\\]+")\)',
        lambda m: f'({m[1]}.token.value === {m[2]} && ({m[1]}.next(), true))', source)
    source = re.sub(r'^( +)((?:this\.)?lex)\.expect\("([^"\\]+)"\);$', lambda m:
        f'{m[1]}{{ if ({m[2]}.token.value !== "{m[3]}") {m[2]}.fail("expected {m[3]}"); {m[2]}.next(); }}',
        source, flags=re.M)
    start = source.index("    expr(minPrecedence = 0) {")
    end = source.index("\n    result(type, branch) {", start)
    expression = source[start:end].replace("this.lex", "lex")
    source = source[:start] + expression.replace("{\n", "{\n        const lex = this.lex;\n", 1) + source[end:]
    if "this.next = this.nextIndexed;" in source:
        source = swap(source, "this.next = this.nextIndexed;",
            "this.next = borrowCurrent && start === 0 && end === source.length\n"
            "                ? this.nextWholeIndexed : this.nextIndexed;")
        source = swap(source, "    nextIndexed() {",
            Path(__file__).with_name("07-borrowed-indexed-advance.js.inc").read_text() + "    nextIndexed() {")
    return source


def main():
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument("compiler", type=Path)
    args.add_argument("arm", choices=("parser", "compact", "cursor", "indexed"))
    args.add_argument("--direct", action="store_true")
    args.add_argument("--compact-fallback", action="store_true")
    options = args.parse_args()
    path = options.compiler / "typed-wasm.js"
    subprocess.run(["python3", str(Path(__file__).with_name("02-stage-prefix.py")), str(path)], check=True)
    source = parser(path.read_text())
    if options.arm in {"compact", "cursor"}:
        source = compact(source) if options.arm == "compact" else table_cursor(source)
        async_path = options.compiler / "typed-async.js"
        async_path.write_text(swap(async_path.read_text(), "    const lex = new typedWasm.Lexer(source);",
            "    const lex = new typedWasm.Lexer(source, 0, source.length, true);"))
    if options.compact_fallback:
        if options.arm != "indexed":
            args.error("--compact-fallback requires the indexed lexer")
        source = compact_index_fallback(source)
    path.write_text(direct(source) if options.direct else source)


if __name__ == "__main__":
    main()
