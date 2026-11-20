function linkStaged(source, reactor) {
    const program = typedRv32.compile(source);
    if (program.importCount || program.relocations.length) throw Error("expected closed encoder");
    return typedRv32.linkSlot(program, reactor, ["psixEncode"]);
}
