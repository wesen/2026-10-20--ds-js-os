// The front end's inspection events: the tape's operations of each inspected function, with source spans.
class InspectionCallbackError extends Error {
    constructor(cause) { super("Typed inspection callback failed", {cause}); }
}

function emitInspection(inspect, event) {
    try {
        inspect.emit(event);
    } catch (error) {
        // compileFunctions rethrows the observer's own error, never as a compiler diagnostic.
        throw new InspectionCallbackError(error);
    }
}

class InspectionTape extends Array {
    constructor(source) {
        super();
        this.source = source;
        this.spans = [];
    }

    push(...cells) {
        const span = this.source();
        for (let i = 0; i < cells.length; i++) this.spans.push(span);
        return super.push(...cells);
    }

    append(other) {
        for (let i = 0; i < other.length; i++) {
            super.push(other[i]);
            this.spans.push(other.spans[i]);
        }
    }
}

// The tape's operations (tape.js), each with the source span of the token at which its opcode was written.
function inspectOperations(tape) {
    const operations = typedTape.decode(tape);
    for (const operation of operations) operation.source = {...tape.spans[operation.offset]};
    return operations;
}

// The front end's event for one function: its tape's operations, locals and source. A backend that writes another
// encoding of the same operations (the Wasm backend) describes them in its own terms (describeWasmFunction).
function inspectFunction(emitter, fn, inspect, origin) {
    const lex = emitter.lex;
    const unit = origin ? "generated" : "original";
    const source = () => {
        const {at, value} = lex.token;
        return {unit, start: at, end: at + value.length, precision: "emission-token",
            ...(origin && {origin})};
    };
    const locals = [];
    const local = emitter.local;
    emitter.local = function (name, type, mutable = false) {
        const index = local.call(this, name, type, mutable);
        const parameter = index < fn.params.length;
        // Parameters are installed before the emitter seeks to the body.
        locals.push({index, name, type, mutable, parameter, source: parameter ? null : source()});
        return index;
    };
    emitter.inspection = {tape: () => new InspectionTape(source)};
    emitter.code = emitter.inspection.tape();
    emitter.function(fn);
    const operations = inspectOperations(fn.code);
    fn.code = Array.from(fn.code);
    emitInspection(inspect, {
        kind: "frontend", target: "tape", function: fn.name, index: fn.index,
        params: fn.params.slice(), result: fn.result, locals, localCount: emitter.nextLocal, operations,
        ...(origin && {sourceText: lex.source}),
    });
}

function finishFunction(emitter, fn, inspect, origin) {
    if (inspect && (inspect.function === undefined || inspect.function === fn.name))
        inspectFunction(emitter, fn, inspect, origin);
    else
        emitter.function(fn);
}
