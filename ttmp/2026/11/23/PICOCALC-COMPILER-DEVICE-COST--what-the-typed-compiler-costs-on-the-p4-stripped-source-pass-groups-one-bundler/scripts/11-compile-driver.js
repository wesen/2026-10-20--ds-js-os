// 11-qjs-compile.c's DRIVER: one compile as the world linker calls it, its image size and a checksum of the image.
(function () {
    const program = typedRv32.compile(SOURCE, WORLD ? typedWorld.imports : [], 1 << 20, {policy: POLICY});
    let sum = 0;
    for (const byte of program.image) sum = (sum * 31 + byte) >>> 0;
    return JSON.stringify({bytes: program.image.length, sum});
})()
