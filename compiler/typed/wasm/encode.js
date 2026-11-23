// The WebAssembly backend, part one: a tape serialized as a Wasm function body. An operation's opcode is its Wasm
// opcode and its operand cells become LEB128 immediates (signed for i32.const; a block type cell, 0x40 or 0x7f, is its
// own one-byte encoding). The text pseudo-ops expand to the Wasm sequences they stand for.
function pushUnsigned(out, value) {
    do {
        const part = value & 127;
        value >>>= 7;
        out.push(part | (value ? 128 : 0));
    } while (value);
}

function unsigned(value) {
    const bytes = [];
    pushUnsigned(bytes, value);
    return bytes;
}

function pushSigned(out, value) {
    while (true) {
        const part = value & 127;
        value >>= 7;
        const done = (value === 0 && !(part & 64)) || (value === -1 && !!(part & 64));
        out.push(part | (done ? 0 : 128));
        if (done) return;
    }
}

// text.checked_address receiver position: trap unless position < capacity (unsigned), then receiver + 2 * position.
function pushCheckedAddress(out, receiver, position) {
    out.push(LOCAL_GET);
    pushUnsigned(out, position);
    out.push(LOCAL_GET);
    pushUnsigned(out, receiver);
    out.push(I32_LOAD, 2, 0, I32_GE_U, IF, VOID, UNREACHABLE, END, LOCAL_GET);
    pushUnsigned(out, receiver);
    out.push(LOCAL_GET);
    pushUnsigned(out, position);
    out.push(I32_CONST, 1, I32_SHL, I32_ADD);
}

// text.literal_stores address literal: one i32.store16 per UTF-16 unit, from address + 4. The tape's check of the
// whole range precedes it.
function pushLiteralStores(out, address, text) {
    for (let i = 0; i < text.length; i++) {
        out.push(LOCAL_GET);
        pushUnsigned(out, address);
        out.push(I32_CONST);
        pushSigned(out, text.charCodeAt(i));
        out.push(I32_STORE16, 1);
        pushUnsigned(out, 4 + 2 * i);
    }
}

// f32.to_i32 (RV32F's fcvt.w.s rtz): i32.trunc_sat_f32_s, but 2^31 - 1 for NaN. `scratch` is an f32 local.
function pushTruncate(out, scratch) {
    out.push(LOCAL_SET);
    pushUnsigned(out, scratch);
    out.push(I32_CONST, 0xff, 0xff, 0xff, 0xff, 0x07, LOCAL_GET);
    pushUnsigned(out, scratch);
    out.push(0xfc, 0x00, LOCAL_GET); // i32.trunc_sat_f32_s
    pushUnsigned(out, scratch);
    out.push(LOCAL_GET);
    pushUnsigned(out, scratch);
    out.push(F32_NE, 0x1b); // NaN: select 2^31 - 1
}

// f32.to_u32 (RV32F's fcvt.wu.s rtz): i32.trunc_sat_f32_u, but 2^32 - 1 for NaN. `scratch` is an f32 local.
function pushTruncateUnsigned(out, scratch) {
    out.push(LOCAL_SET);
    pushUnsigned(out, scratch);
    out.push(I32_CONST, 0x7f, LOCAL_GET);
    pushUnsigned(out, scratch);
    out.push(0xfc, 0x01, LOCAL_GET); // i32.trunc_sat_f32_u
    pushUnsigned(out, scratch);
    out.push(LOCAL_GET);
    pushUnsigned(out, scratch);
    out.push(F32_NE, 0x1b); // NaN: select 2^32 - 1
}

// f32.min_num and f32.max_num (RV32F's fmin.s, fmax.s): the other operand when one is NaN, else f32.min or f32.max,
// which order -0 below +0 as fmin.s does. a and b are f32 scratch locals:
//   select(select(min(a, b), a, b === b), b, a === a)
function pushMinMax(out, op, a, b) {
    const get = local => { out.push(LOCAL_GET); pushUnsigned(out, local); };
    out.push(LOCAL_SET);
    pushUnsigned(out, b);
    out.push(LOCAL_SET);
    pushUnsigned(out, a);
    get(a); get(b); out.push(op === F32_MIN ? 0x96 : 0x97);
    get(a); get(b); get(b); out.push(F32_EQ, 0x1b);
    get(b); get(a); get(a); out.push(F32_EQ, 0x1b);
}

// The local declarations of a body: runs of one value type.
function localGroups(types) {
    const groups = [];
    for (const type of types) {
        const last = groups.at(-1);
        if (last && last[1] === type) last[0]++;
        else groups.push([1, type]);
    }
    return [...unsigned(groups.length), ...groups.flatMap(([count, type]) => [...unsigned(count), type])];
}

// array.address offset: the static address fn.arrayBase + offset. array.zero offset bytes: memory.fill (bulk memory).
function pushArray(out, fn, op, offset, bytes) {
    out.push(I32_CONST);
    pushSigned(out, fn.arrayBase + offset);
    if (op === ARRAY_ZERO) {
        out.push(I32_CONST, 0, I32_CONST);
        pushSigned(out, bytes);
        out.push(0xfc, 0x0b, 0x00);
    }
}

// fn.body: the framed body (size, locals, instructions) of fn's tape. `marks`, when given, receives the byte offset
// of each tape operation within the instructions, by ordinal. Returns the instructions' length.
function encodeFunction(fn, marks) {
    const tape = fn.code, out = [];
    // The expansions of f32.to_i32, f32.min_num and f32.max_num use two f32 scratch locals after the function's own.
    const first = fn.params.length + fn.nlocals;
    let scratch = false;
    for (let at = 0; at < tape.length;) {
        const op = tape[at];
        const n = CELLS[op];
        if (marks) marks.push(out.length);
        // Most operands fit one LEB128 byte; those take the short paths.
        if (op === ARRAY_ADDRESS || op === ARRAY_ZERO) {
            pushArray(out, fn, op, tape[at + 1], tape[at + 2]);
        } else if (n === 1 && op !== I32_CONST && op !== F32_CONST && tape[at + 1] < 128) {
            out.push(op, tape[at + 1]);
        } else if (n === 0 && op < I32_TRUNC_F32) {
            out.push(op);
        } else if (op === I32_CONST) {
            const value = tape[at + 1];
            if (value >= -64 && value < 64) out.push(op, value & 127);
            else {
                out.push(op);
                pushSigned(out, value);
            }
        } else if (op === CHECKED_ADDRESS) {
            pushCheckedAddress(out, tape[at + 1], tape[at + 2]);
        } else if (op === LITERAL_STORES) {
            pushLiteralStores(out, tape[at + 1], fn.literals[tape[at + 2]]);
        } else if (op === F32_CONST) {
            const bits = tape[at + 1];
            out.push(op, bits & 255, (bits >>> 8) & 255, (bits >>> 16) & 255, bits >>> 24);
        } else if (op === I32_TRUNC_F32) {
            scratch = true;
            pushTruncate(out, first);
        } else if (op === U32_TRUNC_F32) {
            scratch = true;
            pushTruncateUnsigned(out, first);
        } else if (op === F32_MIN || op === F32_MAX) {
            scratch = true;
            pushMinMax(out, op, first, first + 1);
        } else if (n < 0 || op === UNCHECKED_ADDRESS) {
            throw new Error("no Wasm encoding for tape opcode " + op + " at " + at);
        } else {
            out.push(op);
            for (let k = 1; k <= n; k++) pushUnsigned(out, tape[at + k]);
        }
        at += 1 + n;
    }
    const types = fn.localTypes ? fn.localTypes.map(type => type === "f32" ? F32 : I32) : Array(fn.nlocals).fill(I32);
    if (scratch) types.push(F32, F32);
    const locals = !types.length ? [0] : !fn.localTypes && !scratch ? [1, ...unsigned(fn.nlocals), I32] : localGroups(types);
    fn.body = unsigned(locals.length + out.length).concat(locals, out);
    return out.length;
}

// Compile source's functions with the front end and serialize each tape as it arrives; the tapes are released.
// Inspection: the front end's event for a function describes its tape; this backend reports the same function's
// Wasm operations instead, each with the source of the tape operation it encodes, and keeps their byte ranges
// for the emission event (inspectWasmEmission).
function compileWasmFunctions(source, functionBase, imported, maxSourceLength, options) {
    const inspect = options?.inspect;
    let tapeEvent = null;
    const frontOptions = inspect && typeof inspect.emit === "function"
        ? {...options, inspect: {function: inspect.function, emit(event) { tapeEvent = event; }}} : options;
    // Local arrays: each function's area below the previous one's, from the top of the module's memory.
    let arrayTop = (options?.memoryPages ?? 1) * 65536;
    return compileFunctions(source, functionBase, imported, maxSourceLength, undefined, fn => {
        if (fn.arrayBytes) {
            fn.arrayBase = arrayTop -= fn.arrayBytes;
            if (arrayTop < 0) throw new SyntaxError("local arrays exceed the module's memory");
        }
        const event = tapeEvent;
        tapeEvent = null;
        const marks = event ? [] : undefined;
        const length = encodeFunction(fn, marks);
        if (event) describeWasmFunction(fn, event, marks, length, inspect);
        fn.code = null;
        fn.literals = null;
    }, undefined, frontOptions);
}
