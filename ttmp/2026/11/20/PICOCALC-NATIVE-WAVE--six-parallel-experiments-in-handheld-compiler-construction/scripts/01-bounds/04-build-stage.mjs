import assert from "node:assert/strict";
import {readFileSync,writeFileSync,copyFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {stage as bounds, root} from "./01-stage.mjs";
import {stage as semantics} from "../02-semantics/01-stage.mjs";
const [target,images] = process.argv.slice(2);
assert(target && images && !resolve(target).startsWith(root+"/"));
const here = dirname(fileURLToPath(import.meta.url));
const system = resolve(target,"picocalc-os");
const compiler = resolve(system,"compiler");
const main = resolve(system,"port/esp32p4/main");
const staged = semantics();
staged["typed-rv32.js"] = bounds(staged["typed-rv32.js"]);
for (const [name,source] of Object.entries(staged)) writeFileSync(resolve(compiler,name),source);
const linker = resolve(compiler,"typed-world.js");
const policies = [["bounds","always"],["bounds","order"],["bounds","selected"],
    ["semantics","late"],["semantics","selected"]];
const wrappers = policies.map(([lane,arm])=>`globalThis.wave_${lane}_${arm} = (source, reactor, options) =>
    compileTypedWorldRv32(source, reactor, {...options, ${lane === "bounds" ? "boundsPolicy" : "semanticPolicy"}:"${arm}"});`);
writeFileSync(linker,readFileSync(linker,"utf8")+"\n"+wrappers.join("\n")+"\n");
const programs = ["stock","bounds-order","bounds-selected","semantics-late","semantics-selected"];
const endpoint = {repeated:"repeated",literal:"literals",write:"rhsOrder"};
let asm = '.section .text.wave_bench,"ax",@progbits\n';
for (const arm of programs) {
    const name = arm.replace("-","_");
    const binary = resolve(main,"wave-"+arm+".bin");
    copyFileSync(resolve(images,"positive-"+arm+".bin"),binary);
    const {entries} = JSON.parse(readFileSync(resolve(images,"positive-"+arm+".json"),"utf8"));
    asm += `.balign 16\nL_${name}:\n.incbin "${binary}"\n`;
    for (const [c,typed] of Object.entries(endpoint))
        asm += `.global ${name}_${c}\n.type ${name}_${c},@function\n.set ${name}_${c},L_${name} + ${entries[typed]}\n`;
}
writeFileSync(resolve(main,"wave_bench.S"),asm);
copyFileSync(resolve(here,"board.c"),resolve(main,"wave_bench.c"));
function replace(file,before,after) {
    const path=resolve(main,file), text=readFileSync(path,"utf8");
    assert.equal(text.split(before).length,2,file);
    writeFileSync(path,text.replace(before,after));
}
replace("CMakeLists.txt","    target_include_directories(${COMPONENT_LIB} PRIVATE ${OS}/sdk/typed)",
    "    target_include_directories(${COMPONENT_LIB} PRIVATE ${OS}/sdk/typed)\n"+
    "    target_sources(${COMPONENT_LIB} PRIVATE wave_bench.c wave_bench.S)\n"+
    "    set_property(SOURCE wave_bench.S APPEND PROPERTY OBJECT_DEPENDS \""+
    programs.map(arm=>"${CMAKE_CURRENT_LIST_DIR}/wave-"+arm+".bin").join(";")+"\")");
replace("main_p4.c",'  else if (!strcmp(cmd, "painter")) p4_painter_status();',
    '  else if (!strcmp(cmd, "painter")) p4_painter_status();\n'+
    '  else if (!strcmp(cmd, "wave12")) { extern void wave12_bench(void); wave12_bench(); }');
