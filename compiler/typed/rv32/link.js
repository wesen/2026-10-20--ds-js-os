// linkSlot: place a compiled program in a native world's reactor.
import {instruction, ZERO, RA} from "./encoding/registers.js";

// The bundled, already linked SDK reactor reserves this area in executable
// text. The native world loader still validates and relocates the completed ELF.
export function linkSlot(program, runtime, entries) {
    const magic = [0x4147454e, 0x44415256, 0x3332534c];
    const headerBytes = 20;
    const importOffset = headerBytes + 4 * entries.length;
    const codeOffset = importOffset + 4 * program.importCount;
    const view = new DataView(runtime.buffer, runtime.byteOffset, runtime.byteLength);
    if (runtime.length < 52 || view.getUint32(0, true) !== 0x464c457f ||
        view.getUint8(4) !== 1 || view.getUint8(5) !== 1 ||
        view.getUint16(16, true) !== 3 || view.getUint16(18, true) !== 243 ||
        (view.getUint32(36, true) & 6) !== 2)
        throw new SyntaxError("expected an ELF32 RISC-V ilp32f reactor");
    const count = view.getUint16(44, true);
    const stride = view.getUint16(42, true);
    const segments = view.getUint32(28, true);
    if (stride !== 32 || segments + stride * count > runtime.length)
        throw new SyntaxError("invalid RV32 reactor program headers");

    let slot = -1, capacity = 0;
    for (let i = 0; i < count; i++) {
        const header = segments + i * stride;
        if (view.getUint32(header, true) !== 1 || !(view.getUint32(header + 24, true) & 1)) continue;
        const start = view.getUint32(header + 4, true);
        const end = start + view.getUint32(header + 16, true);
        if (end > runtime.length) throw new SyntaxError("truncated RV32 reactor code segment");
        for (let at = (start + 3) & -4; at + codeOffset <= end; at += 4) {
            if (view.getUint32(at, true) !== magic[0] || view.getUint32(at + 4, true) !== magic[1] ||
                view.getUint32(at + 8, true) !== magic[2]) continue;
            if (slot >= 0) throw new SyntaxError("ambiguous RV32 reactor slot");
            capacity = view.getUint32(at + 12, true);
            if (view.getUint32(at + 16, true) !== entries.length + 65536 * program.importCount || capacity < codeOffset ||
                capacity > end - at || capacity > 1048576 || capacity % 4)
                throw new SyntaxError("invalid RV32 reactor slot header");
            for (let entry = at + headerBytes; entry < at + importOffset; entry += 4) {
                if (view.getUint32(entry, true) !== 0x00100073)
                    throw new SyntaxError("invalid RV32 reactor entry stub");
            }
            for (let entry = at + importOffset; entry < at + codeOffset; entry += 4) {
                if ((view.getUint32(entry, true) & 0xfff) !== 0x6f)
                    throw new SyntaxError("invalid RV32 runtime import trampoline");
            }
            slot = at;
            at += capacity - 4;
        }
    }
    if (slot < 0) throw new SyntaxError("missing RV32 reactor slot");
    if (program.image.length > capacity - codeOffset) throw new SyntaxError("RV32 program does not fit the reactor slot");
    const bytes = new Uint8Array(runtime);
    const patched = new DataView(bytes.buffer);
    for (let i = 0; i < entries.length; i++) {
        const offset = program.entries[entries[i]];
        if (!Number.isInteger(offset) || offset < 0 || offset + 4 > program.image.length || offset % 4)
            throw new SyntaxError("invalid RV32 entry " + entries[i]);
        const stub = headerBytes + 4 * i;
        patched.setUint32(slot + stub, instruction.j(ZERO, codeOffset + offset - stub), true);
    }
    bytes.set(program.image, slot + codeOffset);
    for (const {offset, index} of program.relocations) {
        const call = codeOffset + offset;
        patched.setUint32(slot + call, instruction.j(RA, importOffset + 4 * index - call), true);
    }
    return bytes;
}
