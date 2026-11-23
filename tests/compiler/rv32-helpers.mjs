// Shared by the typed-rv32*.test.mjs files: the compiler in a fresh realm and instruction-field helpers.
import {readFileSync} from "node:fs";
import {createContext, runInContext} from "node:vm";


export function compiler() {
    const ctx = createContext({});
    for (const file of ["tape.js", "typed-wasm.js", "typed-rv32.js", "typed-rv32-inline.js", "typed-rv32-loops.js"]) {
        runInContext(readFileSync(new URL("../../compiler/typed/" + file, import.meta.url), "utf8"), ctx,
            {filename: file});
    }
    return ctx;
}

export function words(program, name) {
    const start = program.entries[name];
    const end = Object.values(program.entries).find(offset => offset > start) ?? program.image.length;
    const view = new DataView(program.image.buffer, program.image.byteOffset, program.image.byteLength);
    return Array.from({length: (end - start) / 4}, (_, i) => view.getUint32(start + 4 * i, true));
}

export const opcode = word => word & 127;
export const destination = word => (word >>> 7) & 31;
export const sourceRegister = word => (word >>> 15) & 31;
export const adjustsStack = word => opcode(word) === 0x13 && destination(word) === 2 && sourceRegister(word) === 2;
