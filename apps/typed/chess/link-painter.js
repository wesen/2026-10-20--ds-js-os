function linkMobilePainter(source, reactor, options) {
    const program = typedRv32.compile(source, [], 16384, options);
    const entry = program.signatures.find(fn => fn.name === "paintChess");
    if (!entry || entry.result !== "i32" || entry.params.join(",") !== "buffer,buffer" ||
        program.importCount || program.relocations.length || program.asyncLayout)
        throw new SyntaxError("expected a closed paintChess(buffer, buffer): i32");
    return typedRv32.linkSlot(program, reactor, ["paintChess"]);
}
