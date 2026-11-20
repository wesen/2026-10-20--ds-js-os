import {readFileSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {Script, createContext} from "node:vm";
import {createHash} from "node:crypto";
import {performance} from "node:perf_hooks";
import {stage} from "../03-compile.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here,"../../../../../../..");
const ticket = resolve(here,"../..");
const os = resolve(root,"picocalc-os");
const read = path => readFileSync(path,"utf8");
function worldSource(world) {
    const path=resolve(os,"worlds",world);
    return read(resolve(path,"source.list")).trim().split(/\s+/).map(f=>read(resolve(path,f))).join("\n");
}
const inputs = [
  ["projection", read(resolve(ticket,"scripts/01-vertices.typed")), false],
  ["2D painter", read(resolve(os,"worlds/chess/painter.typed")), false],
  ["Files",read(resolve(os,"worlds/files/files.typed")), false],
  ["Chess game",worldSource("chess"),true],
  ["Editor",worldSource("editor"),true],
];
const modules=["typed-wasm.js","typed-async.js","typed-rv32.js","typed-world.js"];
const baseline=Object.fromEntries(modules.map(file=>[file,read(resolve(os,"compiler",file))]));
const candidate=stage();
const digest=b=>createHash("sha256").update(b).digest("hex");
const results=[];
const count=9;
for (const [app,source,world] of inputs) {
    for (let round=0; round<count; round++) {
        for (const mode of round%2 ? ["pie","stock"] : ["stock","pie"]) {
            // Each observation gets a fresh global and imports table. Node may cache
            // parsed code in this process; these are host VM, not P4 cold-boot times.
            const started=performance.now();
            const context=createContext({});
            for (const file of modules) {
                const script=new Script(file==="typed-rv32.js" && mode==="pie" ? candidate : baseline[file], {filename:file});
                script.runInContext(context);
            }
            const setupMs=performance.now()-started;
            const before=performance.now();
            const diagnostics=[];
            const result=context.typedRv32.compile(source,world?context.typedWorld.imports:[],96*1024,{pie:mode==="pie",pieDiagnostics:diagnostics});
            const compileMs=performance.now()-before;
            results.push({app,round,mode,setupMs,compileMs,totalMs:setupMs+compileMs,functions:result.signatures.length,selected:diagnostics.length,bytes:result.image.length,sha256:digest(result.image)});
        }
    }
}
const receipt={runtime:process.version,method:"9 alternating round pairs per app, fresh Node VM realms; setup and compile timed separately, wall milliseconds",results};
writeFileSync(process.argv[2],JSON.stringify(receipt,null,2)+"\n");
