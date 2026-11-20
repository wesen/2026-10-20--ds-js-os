import {readFileSync, writeFileSync, mkdirSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {runInThisContext} from "node:vm";
import {createHash} from "node:crypto";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../../../../..");
const [fixtureFile, out] = process.argv.slice(2);
assert(fixtureFile && out, "usage: node poses.mjs 2D_REPLAY_FIXTURES.bin OUTPUT");
mkdirSync(out, {recursive: true});
for (const file of ["typed-wasm.js", "typed-rv32.js"])
    runInThisContext(readFileSync(resolve(root,"picocalc-os/compiler",file), "utf8"), {filename:file});
const source = readFileSync(resolve(here,"isometric.typed"), "utf8");
const wasm = new WebAssembly.Instance(new WebAssembly.Module(typedWasm.compile(source).bytes)).exports;
const rv = typedRv32.compile(source);
const fixtures = readFileSync(fixtureFile);
const stride = 4 + 180 + 4 + 8192;
assert.equal(fixtures.length, 47 * stride);
const mem = new DataView(wasm.memory.buffer);
const cells = new Uint16Array(wasm.memory.buffer, 4, 90);
const words = new Uint16Array(wasm.memory.buffer, 260, 4096);
mem.setUint32(0, 90, true);
mem.setUint32(256, 4096, true);
const send = (name, object) => writeFileSync(resolve(out,name),object);
const cases = [];
const hash = x => createHash("sha256").update(x).digest("hex");
const reference = Buffer.alloc(fixtures.length);
for (let i=0; i<47; i++) {
    for (let j=0; j<90; j++) cells[j] = fixtures.readUInt16LE(i*stride+4+2*j);
    // Also sample the two normal cursor moves and alternate views of the opening.
    const poses = i === 0 ? [["e2",5,52],["e3",5,44],["f3",5,45],["low",3,52],["high",7,52]] : [["pos-"+i,5,cells[72]]];
    for (const [name,pitch,cursor] of poses) {
        cells[72] = cursor;
        words.fill(0xffff);
        const count = wasm.paintPose(0,256,pitch);
        assert(count>0 && count<=4096 && words[count]===0xffff);
        const bytes = Buffer.from(words.buffer,words.byteOffset,count*2);
        send(name+".words",bytes);
        if (pitch===5) assert.equal(wasm.paintChess(0,256),count);
        const pieces = Array.from(cells.slice(0,64)).filter(x=>x!==0);
        const pieceCommands = pieces.reduce((n, code) => n + (code % 8 <= 3 ? 8 : 10), 0);
        const hints = cells[82]===1 ? "Q R B N promote   Esc cancel" : "Arrows move   Enter select   F2 new   Esc";
        assert.equal(count,6+132*8+pieceCommands*8+2+hints.length);
        // First tile from the projection derived independently at board origin.
        assert.deepEqual(Array.from(words.slice(38,45)),[5,160,42,176,42+2*pitch,160,42+4*pitch]);
        cases.push({name,pitch,cursor,pieces:pieces.length,words:count,commands:134+pieceCommands,hints,commandSha256:hash(bytes)});
        if (name==="e2" || i>0) {
            const start=i*stride;
            reference.writeUInt32LE(90,start);
            for(let j=0;j<90;j++) reference.writeUInt16LE(cells[j],start+4+2*j);
            reference.writeUInt32LE(count,start+184);
            bytes.copy(reference,start+188);
        }
    }
}
send("fixtures.bin",reference);
send("painter.rv32",rv.image);
send("receipt.json",JSON.stringify({sourceBytes:Buffer.byteLength(source),sourceSha256:hash(source),rv32Bytes:rv.image.length,entry:rv.entries.paintChess,cases},null,2)+"\n");
