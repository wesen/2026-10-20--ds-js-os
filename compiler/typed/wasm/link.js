// The WebAssembly backend, part three: a Typed world linked into a trusted Wasm reactor; and what the bundle
// publishes.
// The trusted runtime owns memory, host imports, and world exports. Its
// direct calls to the exported slot keep their original function index.
function linkWorld(source, runtime, entries, imports = [], maxSourceLength, options) {
    const reader = new WasmReader(runtime);
    const header = reader.take(8);
    if (header.join(",") !== "0,97,115,109,1,0,0,0") throw new SyntaxError("invalid Wasm runtime header");
    const sections = [];
    while (!reader.end()) {
        const id = reader.byte(), bytes = reader.sized();
        if (id !== 0) sections.push({id, bytes}); // discard stale names and producer metadata
    }
    if (new Set(sections.map(part => part.id)).size !== sections.length) throw new SyntaxError("duplicate Wasm runtime section");
    const types = readSection(sections, 1, r => r.vector(t => {
        if (t.byte() !== 0x60) throw new SyntaxError("expected Wasm function type");
        return [0x60, ...vec(Array.from(t.sized())), ...vec(Array.from(t.sized()))];
    }));
    const importCount = sections.some(part => part.id === 2)
        ? readSection(sections, 2, r => r.vector(item => {
            item.sized();
            item.sized();
            if (item.byte() !== 0) throw new SyntaxError("expected a Wasm function import");
            return item.uint();
        }).length) : 0;
    const definitions = readSection(sections, 3, r => r.vector(item => item.uint()));
    const exports = readSection(sections, 7, r => r.vector(item => ({
        name: item.sized().join(","), kind: item.byte(), index: item.uint(),
    })));
    const bodies = readSection(sections, 10, r => r.vector(item => {
        const start = item.offset;
        item.sized();
        return item.bytes.subarray(start, item.offset);
    }));
    if (bodies.length !== definitions.length) throw new SyntaxError("mismatched Wasm runtime code and function counts");
    const base = importCount + definitions.length;
    const imported = imports.map(fn => {
        const name = Array.from(fn.name, ch => ch.charCodeAt(0)).join(",");
        const index = exports.find(item => item.name === name && item.kind === 0)?.index;
        if (!Number.isInteger(index) || index < importCount ||
            signature(fn).join(",") !== types[definitions[index - importCount]]?.join(","))
            throw new SyntaxError("Wasm runtime import signature mismatch for " + fn.name);
        return {...fn, index};
    });
    const {functions, records, enums, distinct, asyncLayout, asyncSource} =
        compileWasmFunctions(source, base, imported, maxSourceLength, options);
    for (const entry of entries) {
        const bytesName = Array.from(entry, ch => ch.charCodeAt(0)).join(",");
        const slot = exports.find(item => item.name === bytesName && item.kind === 0)?.index - importCount;
        if (!Number.isInteger(slot) || slot < 0 || slot >= bodies.length)
            throw new SyntaxError("missing Wasm runtime function slot " + entry);
        const target = functions.findIndex(fn => fn.name === entry);
        if (target < 0 || signature(functions[target]).join(",") !== types[definitions[slot]]?.join(","))
            throw new SyntaxError("Wasm runtime slot signature mismatch for " + entry);
        const bridge = [0];
        for (let i = 0; i < functions[target].params.length; i++) bridge.push(LOCAL_GET, ...unsigned(i));
        bridge.push(CALL, ...unsigned(base + target), END);
        bodies[slot] = [...unsigned(bridge.length), ...bridge];
    }
    const replacement = new Map([
        [1, vec([...types, ...functions.map(signature)])],
        [3, vec([...definitions.map(unsigned), ...functions.map((_, i) => unsigned(types.length + i))])],
        [10, encodeByteVector([...bodies, ...functions.map(fn => fn.body)])],
    ]);
    for (const part of sections) if (replacement.has(part.id)) part.bytes = replacement.get(part.id);
    return {bytes: encodeModule(header, sections), records: recordLayouts(records),
        enums: enumLayouts(enums), distinct: [...distinct],
        signatures: functions.map(({name, params, result}) => ({name, params, result})),
        ...(asyncLayout && {asyncLayout}), ...(asyncSource && {asyncSource})};
}

function invoke(exports, signature, args) {
    const i32 = n => Number.isInteger(n) && n >= -2147483648 && n <= 2147483647;
    if (args.length !== signature.params.length) throw new TypeError("wrong argument count");
    const words = args.map((value, i) => {
        if (signature.params[i] === "bool" && typeof value === "boolean") return Number(value);
        if (signature.params[i] === "i32" && i32(value)) return value;
        throw new TypeError(signature.name + " expects " + signature.params[i] + " at argument " + i);
    });
    const value = exports[signature.name](...words);
    return signature.result === "bool" ? value !== 0 : value;
}

// What the bundle publishes. typed-async.js uses the front end's pieces; typed-rv32.js uses compileFunctions and the
// layouts.
globalThis.compileTyped = (source, options) => {
    const {bytes, asyncLayout, asyncSource} = compile(source, options);
    if (asyncLayout) bytes.asyncLayout = asyncLayout;
    if (asyncSource) bytes.asyncSource = asyncSource;
    return bytes;
};
globalThis.typedWasm = {compile, linkWorld, invoke, compileFunctions, Lexer, FunctionEmitter,
    parseDeclarations, scanSignatures, checkAcyclic, inferredType: scalarType, recordLayouts, enumLayouts, withLexIndices};
