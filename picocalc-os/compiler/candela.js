// Link only a closed scene program with the native renderer's four exact signatures.
function linkCandela(source, reactor, options) {
    const program = typedRv32.compile(source, [], 65536, options);
    const signatures = {
        candelaBuildScene: "buffer,i32",
        candelaColorAt: "buffer,buffer,i32,i32,i32",
        candelaShadeRow: "buffer,buffer,buffer,i32,buffer",
        candelaSetParam: "buffer,i32,i32",
    };
    if (program.importCount || program.relocations.length || program.asyncLayout)
        throw new SyntaxError("Candela scene must use closed synchronous functions");
    for (const name of Object.keys(signatures)) {
        const fn = program.signatures.find(candidate => candidate.name === name);
        if (!fn || fn.result !== "i32" || fn.params.join(",") !== signatures[name])
            throw new SyntaxError("invalid native Candela entry " + name);
    }
    return typedRv32.linkSlot(program, reactor, Object.keys(signatures));
}
