const native = typeof __elfReactor !== "undefined";
const input = new Uint8Array(native ? __elfReactor : __wasmReactor);
const compile = native ? compileTypedWorldRv32 : compileTypedWorld;
const started = __now();
const linked = compile(__source, input);
const elapsed = __now() - started;
__print(JSON.stringify({target: native ? "rv32" : "wasm", setupMs: __loadMs,
    compileMs: elapsed, moduleBytes: linked.length}));
