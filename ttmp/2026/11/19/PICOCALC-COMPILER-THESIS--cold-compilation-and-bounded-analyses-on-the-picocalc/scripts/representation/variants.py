"""Derive the experimental compiler lanes from the frozen repository snapshot."""

import re

LANES = ("bytes", "unframed", "packed", "stream")

BODY = """        const locals = nlocals ? [1, ...unsigned(nlocals), I32] : [0];
        const body = [...locals, ...this.code];
        return { name, params, result, code: this.code, nlocals, body: [...unsigned(body.length), ...body] };"""

COMPILE_HEAD = """function compile(source, imports = [], maxSourceLength) {
    const imported = imports.map((fn, index) => ({...fn, index}));
    const {functions, records} = typedWasm.compileFunctions(source, imports.length, imported, maxSourceLength);
"""

COMPILE_END = """        signatures: functions.map(({name, params, result}) => ({name, params, result}))};
}
"""

STREAM_HEAD = """function compile(source, imports = [], maxSourceLength) {
    const imported = imports.map((fn, index) => ({...fn, index}));
    const starts = [];
    const targets = imported.map(fn => ({importIndex: fn.index}));
    const callables = imported.slice();
    const code = [];
    let lowerError;
    const {functions, records} = typedWasm.compileFunctions(source, imports.length, imported, maxSourceLength, fn => {
        // Preserve the baseline's precedence for source diagnostics.
        if (lowerError) return;
        const target = {global: true};
        starts.push(target);
        targets.push(target);
        callables.push(fn);
        try {
            code.push(new FunctionCode(fn, callables, targets).lower());
        } catch (error) {
            lowerError = error;
        }
    });
    if (lowerError) throw lowerError;
"""


def replace_once(source, old, new):
    if source.count(old) != 1:
        raise ValueError(f"Frozen source anchor changed: {old!r}")
    return source.replace(old, new, 1)


def frontend(source, lane):
    if lane == "bytes":
        return source

    # Keep the parser and lexer. The scratch native-only lanes expose
    # functions directly and never call the Wasm module assembly routines.
    source = source.split("\nfunction signature(fn) {")[0]
    source += "\nglobalThis.typedWasm = {compileFunctions};\n})();\n"
    source = replace_once(
        source, BODY, "        return { name, params, result, code: this.code, nlocals };",
    )

    if lane in ("packed", "stream"):
        source = replace_once(source, "this.code.push(OP.const, ...signed(value));",
                              "this.code.push(OP.const, value);")
        start, end = source.index("function unsigned"), source.index("class Lexer")
        source = source[:start] + source[end:]
        source, replaced = re.subn(r"\.\.\.unsigned\(([^\n]+)\)\);", r"\1);", source)
        if replaced != 5 or "unsigned(" in source or "signed(" in source:
            raise ValueError("Frozen frontend integer emission sites changed")

    if lane == "stream":
        source = replace_once(source, "maxSourceLength = 64 * 1024) {",
                              "maxSourceLength = 64 * 1024, consume) {")
        source = replace_once(source, "        functions.push(fn);", """        consume(fn);
        fn.code = null;
        functions.push(fn);""")
    return source


def native(source, lane, *, with_replay=False):
    if lane in ("packed", "stream"):
        start, end = source.index("    leb("), source.index("    emit(word)")
        source = source[:start] + source[end:]
        source = replace_once(source, "    byte() {", "    cell() {")
        source = re.sub(r"this\.(?:byte\(\)|leb\((?:true)?\))", "this.cell()", source)
        if "this.leb" in source or "this.byte" in source:
            raise ValueError("Frozen backend integer decoding sites changed")

    # Image sizing, relocation and image writing are common to all lanes.
    split = source.index("    let words = 0;")
    if lane == "stream":
        start = source.index(COMPILE_HEAD)
        return source[:start] + STREAM_HEAD + source[split:]

    if not with_replay:
        return source

    # Expose the existing backend for a prepared-input replay. The timed
    # compile() entry point itself is unchanged in the bytes lane.
    start = source.index(COMPILE_HEAD) + len(COMPILE_HEAD)
    end = source.index(COMPILE_END) + len(COMPILE_END)
    replay = (
        "function lowerPrepared({functions, records, imported}) {\n"
        "    const imports = imported;\n" + source[start:end]
    )
    return replace_once(source, "globalThis.typedRv32 = {compile, linkSlot};", replay + "\n"
                        "globalThis.typedRv32 = {compile, linkSlot, lowerPrepared};")
