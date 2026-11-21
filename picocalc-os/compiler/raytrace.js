// Four synchronous, closed entry points. Entry order is the native slot ABI.
function linkTypedRay(source, reactor, options) {
    const signatures = {
        typedRayFrame:  "buffer,buffer,i32,i32,i32,i32",
        typedRayRender: "buffer,buffer,buffer,buffer,i32,i32,i32,i32",
        typedRayTrace:  "buffer,buffer,buffer,i32,i32",
        typedRayShade:  "buffer,buffer,buffer,buffer,i32,i32,i32,i32",
    };
    const program = typedRv32.compile(source, [], 65536, options);
    if (program.importCount || program.relocations.length || program.asyncLayout)
        throw new SyntaxError("complete ray program requires closed synchronous functions");
    for (const [name, params] of Object.entries(signatures)) {
        const fn = program.signatures.find(fn => fn.name === name);
        if (!fn || fn.result !== "i32" || fn.params.join(",") !== params)
            throw new SyntaxError("invalid ray entry " + name);
    }
    return typedRv32.linkSlot(program, reactor, Object.keys(signatures));
}
