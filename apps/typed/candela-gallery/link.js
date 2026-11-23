// Link Candela's kernel and the gallery's scenes (generated Typed, tools/gen/candela/kernel-typed.mjs) with the four
// entries of the Typed gallery slot, in slot order (firmware/port/esp32p4/main/candela_typed_slot.S).
function linkCandelaGallery(source, reactor, options) {
    const signatures = {
        cdlLayout: "buffer",
        cdlInit: "K",
        cdlSky: "K",
        cdlRenderSpan: "K,buffer,i32,i32,i32,i32",
    };
    const program = typedRv32.compile(source, [], 1 << 20, options);
    if (program.importCount || program.relocations.length || program.asyncLayout)
        throw new SyntaxError("the Candela kernel must be closed synchronous functions");
    for (const [name, params] of Object.entries(signatures)) {
        const fn = program.signatures.find(candidate => candidate.name === name);
        if (!fn || fn.result !== "i32" || fn.params.join(",") !== params)
            throw new SyntaxError("invalid Candela kernel entry " + name);
    }
    return typedRv32.linkSlot(program, reactor, Object.keys(signatures));
}
