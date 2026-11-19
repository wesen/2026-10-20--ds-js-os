import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {writeFileSync} from "node:fs";
import {join} from "node:path";
import vm from "node:vm";

const [oldRef, newRef, dir, mode] = process.argv.slice(2);
assert(oldRef && newRef && dir, "pass control revision, candidate revision and scratch project");
const git = (...args) => execFileSync("git", args);
const read = (rev, path) => git("show", rev + ":picocalc-os/" + path);
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const source = read(oldRef, "worlds/files/files.typed");
const header = read(oldRef, "worlds/files/slots.h");
assert.deepEqual(source, read(newRef, "worlds/files/files.typed"));
assert.deepEqual(header, read(newRef, "worlds/files/slots.h"));

function compile(ref) {
    const revision = git("rev-parse", "--verify", ref + "^{commit}").toString().trim();
    const ctx = vm.createContext();
    const compiler = {};
    for (const path of ["compiler/typed-wasm.js", "compiler/typed-rv32.js"]) {
        const bytes = read(revision, path);
        compiler[path] = digest(bytes);
        vm.runInContext(bytes.toString(), ctx, {filename: path});
    }
    const program = ctx.typedRv32.compile(source.toString());
    const entry = program.entries.filesCompare;
    const stop = Math.min(...Object.values(program.entries).filter(n => n > entry), program.image.length);
    assert(Number.isInteger(entry) && entry < stop);
    const signature = program.signatures.find(fn => fn.name === "filesCompare");
    assert.equal(signature.params.join(","), "string,bool,string,bool");
    assert.equal(signature.result, "i32");
    assert(!program.relocations.some(r => r.offset >= entry && r.offset < stop));
    const code = Buffer.from(program.image.slice(entry, stop));
    // This function has only local branches and jumps. Check every target
    // before extracting the slice, including jumps that do not use relocations.
    let fnv = 0x811c9dc5;
    for (const byte of code) fnv = Math.imul(fnv ^ byte, 0x01000193) >>> 0;
    for (let pc = 0; pc < code.length; pc += 4) {
        const w = code.readUInt32LE(pc), op = w & 127;
        assert.equal(w & 3, 3);
        let displacement;
        if (op === 0x6f) {
            assert.equal((w >>> 7) & 31, 0, "unexpected direct call");
            displacement = ((w & 0xff000) | ((w >>> 20) & 0x7fe) |
                ((w >>> 9) & 0x800) | (w >> 31 << 20));
        } else if (op === 0x63) {
            displacement = ((w >>> 7) & 0x1e) | ((w >>> 20) & 0x7e0) |
                ((w << 4) & 0x800) | (w >> 31 << 12);
        } else if (op === 0x67) {
            assert.equal(w, 0x00008067, "unexpected indirect call or jump");
        } else {
            assert.notEqual(op, 0x17, "unexpected PC-relative address materialization");
        }
        if (displacement !== undefined)
            assert((pc + displacement) % 4 === 0 && pc + displacement >= 0 && pc + displacement < code.length);
    }
    return {code, meta: {revision, compiler, imageSha256: digest(program.image), offset: entry,
        bytes: code.length, sha256: digest(code), fnv}};
}

const lanes = {old: compile(oldRef), next: compile(newRef)};
const identical = lanes.old.code.equals(lanes.next.code);
assert(!identical || mode === "--smoke", "identical function bodies; production comparison requires a real change");
const manifest = {smoke: identical, sourceSha256: digest(source), abiSha256: digest(header)};
const assembly = ['.section .text.files_compare_pair,"ax",@progbits', '.option push', '.option norvc', '.option norelax'];
const metadata = ["#pragma once", "#include <stdint.h>", '#define BENCH_SMOKE ' + (identical ? 1 : 0)];
for (const [label, {code, meta}] of Object.entries(lanes)) {
    manifest[label] = meta;
    const symbol = "compare_" + label, tag = label.toUpperCase();
    assembly.push(".balign 4", ".global " + symbol, ".type " + symbol + ",@function", symbol + ":");
    for (let i = 0; i < code.length; i += 4)
        assembly.push(".long 0x" + code.readUInt32LE(i).toString(16).padStart(8, "0"));
    assembly.push(".size " + symbol + ", .-" + symbol);
    if (label === "old") assembly.push(".space " + ((64 - code.length % 64) % 64));
    metadata.push('#define ' + tag + '_REV "' + meta.revision + '"',
        '#define ' + tag + '_BYTES ' + meta.bytes, '#define ' + tag + '_FNV UINT32_C(' + meta.fnv + ')');
}
assembly.push(".option pop");
writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
writeFileSync(join(dir, "main/functions.S"), assembly.join("\n") + "\n");
writeFileSync(join(dir, "main/metadata.h"), metadata.join("\n") + "\n");
writeFileSync(join(dir, "main/slots.h"), header);
