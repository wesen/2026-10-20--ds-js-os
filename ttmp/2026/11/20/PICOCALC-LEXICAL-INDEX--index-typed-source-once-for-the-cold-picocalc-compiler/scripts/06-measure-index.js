// A fresh vendored QuickJS process evaluates this after loading one compiler lane.
(() => {
"use strict";

const [app, engine, sourcePath, reactorPath, emit] = scriptArgs;
const linkers = {editor: "TypedWorld", files: "Files", agenda: "Agenda"};
if (!Object.hasOwn(linkers, app)) throw new Error("expected editor, agenda or files");
const source = readText(sourcePath);

function readBase64(path) {
    const input = readText(path).trim();
    const digits = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const table = new Uint8Array(128);
    for (let i = 0; i < digits.length; i++) table[digits.charCodeAt(i)] = i;
    const padding = input.endsWith("==") ? 2 : Number(input.endsWith("="));
    const bytes = new Uint8Array((input.length / 4) * 3 - padding);
    for (let i = 0, j = 0; i < input.length; i += 4) {
        const word = (table[input.charCodeAt(i)] << 18) | (table[input.charCodeAt(i + 1)] << 12) |
            (table[input.charCodeAt(i + 2)] << 6) | table[input.charCodeAt(i + 3)];
        bytes[j++] = word >>> 16;
        if (j < bytes.length) bytes[j++] = word >>> 8;
        if (j < bytes.length) bytes[j++] = word;
    }
    return bytes;
}

const reactor = reactorPath === "-" ? undefined : readBase64(reactorPath);
let bytes, layout;
const before = cpuMs();
if (engine === "raw-rv32") {
    const program = typedRv32.compile(source, app === "editor" ? typedWorld.imports : [], 96 * 1024);
    bytes = program.image;
    layout = program.asyncLayout;
} else {
    const suffix = engine === "wasm" ? "" : "Rv32";
    const options = {streamFunctions: engine !== "rv32-buffered"};
    bytes = globalThis["compile" + linkers[app] + suffix](source, reactor, options);
    layout = bytes.asyncLayout;
}
const ms = cpuMs() - before;
print(JSON.stringify({app, engine, ms, bytes: bytes.length, layout}));
if (emit === "hex") {
    const chars = "0123456789abcdef";
    const hex = Array.from({length: 256}, (_, i) => chars[i >>> 4] + chars[i & 15]);
    for (let start = 0; start < bytes.length; start += 1024) {
        let out = "";
        const end = Math.min(start + 1024, bytes.length);
        for (let i = start; i < end; i++) out += hex[bytes[i]];
        print(out);
    }
}
})();
