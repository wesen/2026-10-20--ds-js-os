// The professor's frontend-only operation, using process CPU time and an untimed warm-up.
(() => {
    const source = readText(scriptArgs[0]);
    const imports = typedWorld.imports;
    const indexed = imports.map((fn,index) => ({...fn,index}));
    function compile() {
        return typedWasm.compileFunctions(source, imports.length, indexed, 96*1024).functions.length;
    }
    const functions = compile();
    const ms = [];
    for (let i=0; i<15; i++) {
        const before = cpuMs();
        const count = compile();
        ms.push(cpuMs()-before);
        if (count !== functions) throw new Error("inconsistent number of functions");
    }
    print(JSON.stringify({functions,ms}));
})();
