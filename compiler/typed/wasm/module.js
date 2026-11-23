// The WebAssembly backend, part two: a module of Typed functions (compile), and the reader and writer of
// module sections that linkWorld uses.
function vec(elements) {
    return [...unsigned(elements.length), ...elements.flat()];
}

function section(id, data) {
    return [id, ...unsigned(data.length), ...data];
}

// A Typed type as a Wasm value type: f32 is F32, every other type an i32.
const valueType = type => type === "f32" ? F32 : I32;

// A record result is several results (WebAssembly's multi-value), one per leaf.
function signature(fn) {
    return [0x60, ...vec(fn.params.map(valueType)), ...vec((fn.results ?? [fn.result]).map(valueType))];
}

// What compile, linkWorld and typedRv32.compile publish of each function.
const publicSignature = ({name, params, result, results}) => ({name, params, result, ...(results && {results})});

// options.maxSourceLength (default 64 KiB) and options.memoryPages (the exported memory's fixed size in 64 KiB pages,
// default 1) serve large programs such as the Candela kernel (PICOCALC-CANDELA-TYPED); the defaults keep every module.
function compile(source, options) {
    const {functions, records, enums, distinct, asyncLayout, asyncSource} =
        compileWasmFunctions(source, 0, [], options?.maxSourceLength, options);
    const pages = options?.memoryPages ?? 1;
    const headers = functions.map(signature);
    const names = functions.map((fn, i) => [
        ...vec(Array.from(fn.name, char => char.charCodeAt(0))), 0, ...unsigned(i),
    ]);
    const bytes = Uint8Array.from([
        0, 0x61, 0x73, 0x6d, 1, 0, 0, 0,
        ...section(1, vec(headers)),
        ...section(3, vec(functions.map((_, i) => unsigned(i)))),
        ...section(5, [1, 1, ...unsigned(pages), ...unsigned(pages)]),
        ...section(7, vec([...names, [...vec([109,101,109,111,114,121]), 2, 0]])),
        ...section(10, vec(functions.map(fn => fn.body))),
    ]);
    if (options?.inspect && functions.some(fn => fn[inspectedWasm])) {
        try {
            inspectWasmEmission(bytes, functions, options.inspect);
        } catch (error) {
            if (error instanceof InspectionCallbackError) throw error.cause;
            throw error;
        }
    }
    return {
        bytes,
        records: recordLayouts(records),
        enums: enumLayouts(enums),
        distinct: [...distinct],
        signatures: functions.map(publicSignature),
        ...(asyncLayout && {asyncLayout}),
        ...(asyncSource && {asyncSource}),
    };
}

class WasmReader {
    constructor(bytes) {
        this.bytes = bytes;
        this.offset = 0;
    }

    take(length) {
        const end = this.offset + length;
        if (end > this.bytes.length) throw new SyntaxError("truncated Wasm runtime");
        const bytes = this.bytes.subarray(this.offset, end);
        this.offset = end;
        return bytes;
    }

    byte() { return this.take(1)[0]; }

    uint() {
        let value = 0;
        for (let shift = 0; shift <= 28; shift += 7) {
            const part = this.byte();
            value += (part & 127) * 2 ** shift;
            if (!(part & 128) && value <= 0xffffffff) return value;
        }
        throw new SyntaxError("invalid Wasm u32");
    }

    sized() { return this.take(this.uint()); }

    vector(read) {
        const count = this.uint();
        if (count > this.bytes.length - this.offset) throw new SyntaxError("truncated Wasm vector");
        return Array.from({length: count}, () => read(this));
    }

    end() { return this.offset === this.bytes.length; }
}

function readSection(sections, id, read) {
    const section = sections.find(part => part.id === id);
    if (!section) throw new SyntaxError("missing Wasm runtime section " + id);
    const reader = new WasmReader(section.bytes);
    const result = read(reader);
    if (!reader.end()) throw new SyntaxError("trailing Wasm runtime section data " + id);
    return result;
}

function encodeModule(header, sections) {
    const result = new Uint8Array(header.length + sections.reduce(
        (sum, part) => sum + 1 + unsigned(part.bytes.length).length + part.bytes.length, 0));
    result.set(header);
    let offset = header.length;
    for (const {id, bytes} of sections) {
        const prefix = [id, ...unsigned(bytes.length)];
        result.set(prefix, offset);
        offset += prefix.length;
        result.set(bytes, offset);
        offset += bytes.length;
    }
    return result;
}

function encodeByteVector(elements) {
    const prefix = unsigned(elements.length);
    const result = new Uint8Array(prefix.length + elements.reduce((sum, bytes) => sum + bytes.length, 0));
    result.set(prefix);
    let at = prefix.length;
    for (const bytes of elements) {
        result.set(bytes, at);
        at += bytes.length;
    }
    return result;
}
