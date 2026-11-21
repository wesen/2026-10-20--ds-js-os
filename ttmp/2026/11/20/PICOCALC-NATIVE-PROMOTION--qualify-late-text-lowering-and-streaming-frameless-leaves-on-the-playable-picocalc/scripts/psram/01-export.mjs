// Export the exact fully linked Chess ELFs and guest entry addresses used in the paired trial.
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {readFileSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createContext, runInContext} from "node:vm";

const [ordinary, promotedRev, out] = process.argv.slice(2);
assert(ordinary && promotedRev && out);
const day = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const ticket = "PICOCALC-NATIVE-WAVE--six-parallel-experiments-in-handheld-compiler-construction";
const reference = name => JSON.parse(readFileSync(resolve(day,ticket,"various",name),"utf8"));
const expected = reference("director/composed-release-worlds.json").chess;
const stock = reference("04-deps/release-inputs.json");
const hash = b => createHash("sha256").update(b).digest("hex");
const firmware = readFileSync(ordinary);
assert.equal(hash(firmware),stock.applicationSHA256);
function asset(name) {
    const f = stock.files[name], b = firmware.subarray(f.releaseOffset, f.releaseOffset+f.bytes);
    assert.equal(hash(b), f.sha256);
    return b;
}
const source = asset("chess.typed").toString(), reactor = asset("chess.elf");
const arms = [];
const defines = [];
for (const [name, rev, key] of [["stock","5f77855","early-stock"],["promoted",promotedRev,"late-leaf"]]) {
    const c = createContext({});
    for (const file of ["typed-wasm.js","typed-async.js","typed-rv32.js","typed-world.js"]) {
        const code = execFileSync("git", ["show",rev+":picocalc-os/compiler/"+file], {encoding:"utf8"});
        runInContext(code,c,{filename:file});
    }
    let program;
    const link = c.typedRv32.linkSlot;
    c.typedRv32.linkSlot = (p,...args) => {program=p; return link(p,...args);};
    const elf = Buffer.from(c.compileTypedWorldRv32(source,reactor,{}));
    assert.equal(hash(elf),expected.arms[key].linkedELFSHA256);
    const marker = Buffer.from("4e454741565241444c533233","hex");
    const slot = elf.indexOf(marker);
    assert(slot >= 0 && elf.indexOf(marker,slot+4) < 0);
    const codeAt = slot + 20 + 4*(c.typedWorld.entries.length+program.importCount);
    const ph = elf.readUInt32LE(28), count = elf.readUInt16LE(44);
    let codeVaddr;
    for(let i=0;i<count;i++) {
        const p = ph + 32*i, fileOffset = elf.readUInt32LE(p+4);
        if(elf.readUInt32LE(p)===1 && (elf.readUInt32LE(p+24)&1) &&
           codeAt >= fileOffset && codeAt+program.image.length <= fileOffset+elf.readUInt32LE(p+16))
            codeVaddr = elf.readUInt32LE(p+8)+codeAt-fileOffset;
    }
    assert(Number.isInteger(codeVaddr));
    const addresses={};
    for (const fn of ["chessStartSearch","chessSearchSlice"]) {
        const entry=program.entries[fn]; assert(Number.isInteger(entry) && entry%4===0);
        assert.deepEqual(elf.subarray(codeAt+entry,codeAt+entry+4),Buffer.from(program.image.subarray(entry,entry+4)));
        addresses[fn] = codeVaddr+entry;
        defines.push("#define "+name.toUpperCase()+"_"+fn+" "+addresses[fn]+"u");
    }
    writeFileSync(resolve(out,name+".elf"),elf);
    arms.push({name,rev,linkedSHA256:hash(elf),linkedSize:elf.length,codeBytes:program.image.length,addresses});
}
writeFileSync(resolve(out,"addresses.h"),defines.join("\n")+"\n");
writeFileSync(resolve(out,"inputs.json"),JSON.stringify(arms,null,2)+"\n");
