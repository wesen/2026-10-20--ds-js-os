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

// fn.body: the framed body (size, locals, instructions) of fn's tape. `marks`, when given, receives the byte offset
// of each tape operation within the instructions, by ordinal. Returns the instructions' length.
function encodeFunction(fn, marks) {
    const tape = fn.code, out = [];
    for (let at = 0; at < tape.length;) {
        const op = tape[at];
        const n = CELLS[op];
        if (marks) marks.push(out.length);
        // Most operands fit one LEB128 byte; those take the short paths.
        if (n === 1 && op !== I32_CONST && tape[at + 1] < 128) {
            out.push(op, tape[at + 1]);
        } else if (n === 0) {
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
        } else if (n < 0 || op === UNCHECKED_ADDRESS) {
            throw new Error("no Wasm encoding for tape opcode " + op + " at " + at);
        } else {
            out.push(op);
            for (let k = 1; k <= n; k++) pushUnsigned(out, tape[at + k]);
        }
        at += 1 + n;
    }
    const locals = fn.nlocals ? [1, ...unsigned(fn.nlocals), I32] : [0];
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
    return compileFunctions(source, functionBase, imported, maxSourceLength, undefined, fn => {
        const event = tapeEvent;
        tapeEvent = null;
        const marks = event ? [] : undefined;
        const length = encodeFunction(fn, marks);
        if (event) describeWasmFunction(fn, event, marks, length, inspect);
        fn.code = null;
        fn.literals = null;
    }, undefined, frontOptions);
}
