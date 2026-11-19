// Shared linker contract for complete typed worlds on both targets.
(() => {
    "use strict";
    const signatures = new Map([
        ["typedWorldMeta", "i32,buffer"],
        ["typedWorldEvent", "i32,buffer,buffer"],
    ]);
    const entries = [...signatures.keys()];
    // Order matches the trampoline table in sdk/typed/rv32-slot.S.
    const imports = [{name: "typedSdkScreen", params: ["buffer", "i32", "buffer", "i32"], result: "i32"}];

    function validate(program) {
        for (const [name, params] of signatures) {
            const entry = program.signatures.find(fn => fn.name === name);
            if (!entry || entry.result !== "i32" || entry.params.join(",") !== params)
                throw new SyntaxError("Typed world requires " + name + "(" + params + "): i32");
        }
    }

    globalThis.compileTypedWorld = function(source, reactor) {
        const program = typedWasm.linkWorld(source, reactor, entries, imports);
        validate(program);
        return program.bytes;
    };

    globalThis.compileTypedWorldRv32 = function(source, reactor) {
        const program = typedRv32.compile(source, imports);
        validate(program);
        return typedRv32.linkSlot(program, reactor, entries);
    };
})();
