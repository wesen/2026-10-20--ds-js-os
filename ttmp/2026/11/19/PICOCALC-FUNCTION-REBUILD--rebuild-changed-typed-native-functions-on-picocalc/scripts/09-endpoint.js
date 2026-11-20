/* Prepare an independent candidate or warm-clean request before the clock. */
globalThis.rebuildEndpoint = function(source, runtime, incremental) {
    const changed = rebuildCases.filesCases(source).find(test => test.id === "body").source;
    if (!incremental) {
        compileFilesRv32(source, runtime);
        return {changed, compile: text => compileFilesRv32(text, runtime)};
    }
    const session = createFunctionRebuild(rebuildFiles, runtime);
    if (session.build(source).mode !== "fragments") throw new Error("endpoint seed failed");
    return {changed, compile(text) {
        const output = session.build(text);
        if (output.mode !== "fragments" || output.built.length !== 1 || output.reused.length !== 6)
            throw new Error("endpoint did not rebuild exactly the changed Files helper");
        return output.bytes;
    }};
};
