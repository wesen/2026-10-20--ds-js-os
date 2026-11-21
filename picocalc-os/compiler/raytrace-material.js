function linkTypedMaterial(source, template, options) {
    const program = typedRv32.compile(source, [], 65536, options);
    if (program.importCount || program.relocations.length || program.asyncLayout)
        throw new SyntaxError("Typed material benchmark requires a closed synchronous module");
    const signatures = {
        typedRayMaterialFrame: "buffer,buffer,buffer,buffer,buffer,buffer,i32,i32",
        candelaHandShared: "buffer",
        candelaHandTile: "buffer",
        candelaSetParam: "buffer,i32,i32",
    };
    for (const name of Object.keys(signatures)) {
        const fn = program.signatures.find(candidate => candidate.name === name);
        if (!fn || fn.result !== "i32" || fn.params.join(",") !== signatures[name])
            throw new SyntaxError("Invalid Typed material benchmark entry " + name);
    }
    return typedRv32.linkSlot(program, template, Object.keys(signatures));
}
