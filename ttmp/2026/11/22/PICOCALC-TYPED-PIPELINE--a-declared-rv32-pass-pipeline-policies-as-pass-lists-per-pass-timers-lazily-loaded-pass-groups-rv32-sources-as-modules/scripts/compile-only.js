(function () {
    const t0 = performance.now();
    const program = typedRv32.compile(SOURCE, WORLD ? typedWorld.imports : [], 1 << 20, {policy: POLICY});
    return JSON.stringify({bytes: program.image.length, ms: performance.now() - t0});
})()
