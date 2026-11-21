// Compile source with the production streaming Typed backend and export pure RV32 entry symbols.
import {readFileSync,writeFileSync} from "node:fs";
import {compilerRevision,loadCompiler} from "./13-measured-compiler.mjs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
const [input,out]=process.argv.slice(2);
if(!out) throw Error("usage: node 02-build-typed.mjs physics.typed OUTDIR");
const vm=loadCompiler(["typed-wasm","typed-rv32","typed-pie-loops"]);
const source=readFileSync(input,"utf8"), wasm=vm.typedWasm.compile(source);
const rv=vm.typedRv32.compile(source,[],undefined,{streamFunctions:true});
if(rv.relocations.length) throw Error("physics corpus must be a self-contained module");
const image=Buffer.from(rv.image);
const entries=new Map(Object.entries(rv.entries).map(([name,pc])=>[pc,name]));
const lines=[".section .text.physics_typed,\"ax\",@progbits",".option push",".option norvc",".balign 4"];
for(let pc=0;pc<image.length;pc+=4) {
    if(entries.has(pc)) {
        const sym="physics_typed_"+entries.get(pc);
        lines.push(".global "+sym,".type "+sym+",@function",sym+":");
    }
    lines.push(".4byte 0x"+image.readUInt32LE(pc).toString(16).padStart(8,"0"));
}
lines.push(".option pop");
writeFileSync(resolve(out,"physics-typed.S"),lines.join("\n")+"\n");
writeFileSync(resolve(out,"physics.wasm"),Buffer.from(wasm.bytes));
writeFileSync(resolve(out,"physics-typed.bin"),image);
writeFileSync(resolve(out,"physics-typed.json"),JSON.stringify({compilerRevision,sourceSHA:createHash("sha256").update(source).digest("hex"),imageSHA:createHash("sha256").update(image).digest("hex"),entries:rv.entries,bytes:image.length},null,2)+"\n");
