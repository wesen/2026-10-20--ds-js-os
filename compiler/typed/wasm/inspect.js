// The WebAssembly backend's inspection events: each inspected function's Wasm operations and their byte ranges in
// the final module.
const inspectedWasm = Symbol("Wasm inspection ranges");

function describeWasmFunction(fn, event, marks, length, inspect) {
    const tapeOperations = event.operations;
    const operations = typedTape.decode(fn.body.slice(fn.body.length - length), true);
    let j = 0;
    for (const operation of operations) {
        while (j + 1 < marks.length && marks[j + 1] <= operation.offset) j++;
        operation.source = {...tapeOperations[j].source};
    }
    // Do not let the callback mutate the internal placement information.
    fn[inspectedWasm] = {length, ranges: operations.map(({ordinal, offset, length}) => ({ordinal, offset, length}))};
    emitInspection(inspect, {...event, target: "wasm", operations});
}

function inspectWasmEmission(bytes, functions, inspect) {
    const reader = new WasmReader(bytes);
    reader.take(8);
    while (!reader.end()) {
        const id = reader.byte();
        const size = reader.uint();
        if (id !== 10) {
            reader.take(size);
            continue;
        }
        const sectionEnd = reader.offset + size;
        if (reader.uint() !== functions.length) throw new Error("unexpected Wasm code section count");
        for (const fn of functions) {
            const bodySize = reader.uint();
            const start = reader.offset;
            const end = start + bodySize;
            const inspected = fn[inspectedWasm];
            if (inspected) {
                const instructionsStart = end - inspected.length;
                const ranges = inspected.ranges.map(({ordinal, offset, length}) => {
                    const from = instructionsStart + offset;
                    const to = from + length;
                    return {ordinal, start: from, end: to, bytes: Array.from(bytes.subarray(from, to))};
                });
                emitInspection(inspect, {kind: "emission", target: "wasm", function: fn.name, index: fn.index,
                    start, end, instructionsStart, ranges});
            }
            reader.take(bodySize);
        }
        if (reader.offset !== sectionEnd) throw new Error("unexpected Wasm code section size");
        return;
    }
    throw new Error("missing Wasm code section for Typed inspection");
}
