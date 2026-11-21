// Loaded in the small QuickJS harness. Its optional C lexer is identical to firmware.
const source = readText(scriptArgs[0]);
const wasm = typedWasm.compile(source).bytes;
const rv = typedRv32.compile(source).image;
print(JSON.stringify({wasm:Array.from(wasm),rv32:Array.from(rv)}));
