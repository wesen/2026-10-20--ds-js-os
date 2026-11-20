// Shared linker contract for complete typed worlds on both targets.
(() => {
    "use strict";
    const signatures = new Map([
        ["typedWorldMeta", "i32,buffer"],
        ["typedWorldEvent", "WorldEvent,WorldState,buffer,buffer"],
    ]);
    const entries = [...signatures.keys()];
    const maxSourceLength = 96 * 1024;
    // Order matches the trampoline table in sdk/typed/rv32-slot.S.
    const imports = [
        ["typedSdkScreen", "buffer,i32,buffer,i32", "i32"],
        ["typedSdkBuffer", "i32", "buffer"],
        ["typedSdkView", "buffer,i32", "string"],
        ["typedSdkEventText", "i32,buffer,i32,buffer", "i32"],
        ["typedSdkEventHandle", "buffer,i32", "i32"],
        ["typedSdkFileRead", "i32", "i32", true],
        ["typedSdkRelease", "i32", "i32"],
        ["typedSdkReply", "buffer,i32", "i32"],
        ["typedSdkYield", "", "i32", true],
        ["typedSdkCapture", "i32,buffer,i32", "i32"],
        ["typedSdkMove", "buffer,i32,i32,i32", "i32"],
        ["typedSdkEventInt", "buffer,i32", "i32"],
        ["typedSdkSend", "buffer,i32,buffer,i32,buffer,i32", "i32"],
        ["typedSdkWriteSnapshot", "i32,i32", "i32", true],
        ["typedSdkRestore", "i32,buffer", "i32"],
        ["typedSdkMatches", "i32,buffer,i32", "i32"],
        ["typedSdkError", "buffer", "i32"],
        ["typedSdkStoreLoad", "buffer", "i32"],
        ["typedSdkStoreSave", "buffer,i32", "i32"],
        ["typedSdkTimestamp", "buffer,i32", "i32"],
        ["typedSdkUpper", "string,i32,i32,buffer,i32", "i32"],
        ["typedSdkSeek", "string,i32,i32,i32,i32,i32,i32", "i32"],
        ["typedSdkLastIndex", "string,i32,i32,i32", "i32"],
        ["typedSdkCountUnit", "string,i32,i32,i32", "i32"],
        ["typedSdkNthIndex", "string,i32,i32,i32,i32", "i32"],
        ["typedSdkCopySpan", "string,i32,i32,buffer,i32", "i32"],
        ["typedSdkCodePoints", "string,i32,i32", "i32"],
        ["typedSdkPointIndex", "string,i32,i32,i32", "i32"],
    ].map(([name, params, result, awaitable = false]) => ({
        name, params: params ? params.split(",") : [], result, awaitable,
    }));
    globalThis.typedWorld = {entries, imports};

    function validate(program) {
        const event = Object.entries(program.records.WorldEvent ?? {});
        const expected = [["kind", "i32"], ["ask", "bool"], ["token", "i32"], ["ok", "bool"]];
        if (event.length !== expected.length || event.some(([name, field], i) =>
            name !== expected[i][0] || field.type !== expected[i][1] || field.offset !== i * 4))
            throw new SyntaxError("Typed world requires the shared WorldEvent record");
        const state = Object.values(program.records.WorldState ?? {});
        if (state.length > 80 || state.some(({type}) => type !== "i32" && type !== "bool" &&
            !Object.hasOwn(program.enums, type) && !program.distinct.includes(type)))
            throw new SyntaxError("WorldState supports up to 80 scalar fields");
        for (const [name, params] of signatures) {
            const entry = program.signatures.find(fn => fn.name === name);
            if (!entry || entry.result !== "i32" || entry.params.join(",") !== params)
                throw new SyntaxError("Typed world requires " + name + "(" + params + "): i32");
        }
    }

    globalThis.compileTypedWorld = function(source, reactor) {
        const program = typedWasm.linkWorld(source, reactor, entries, imports, maxSourceLength);
        validate(program);
        return program.bytes;
    };

    globalThis.compileTypedWorldRv32 = function(source, reactor, options) {
        const program = typedRv32.compile(source, imports, maxSourceLength, options);
        validate(program);
        return typedRv32.linkSlot(program, reactor, entries);
    };
})();
