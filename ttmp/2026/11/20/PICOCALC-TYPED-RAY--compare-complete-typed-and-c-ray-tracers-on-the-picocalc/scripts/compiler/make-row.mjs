// Build a standalone experimental QuickJS backend with a proved, versioned
// full-row template. The compiler on the target needs no filesystem or tools.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createContext,runInContext} from 'node:vm';
const [toolchain,typed,mode,output]=process.argv.slice(2);
if (!['explicit','inferred','matched'].includes(mode) || !output)
    throw Error('usage: node make-row.mjs TOOL-PREFIX FROZEN.typed explicit|inferred|matched BACKEND.js');
const work=mkdtempSync(join(tmpdir(),'typed-ray-kernel-'));
const file=name=>join(work,name);
const src=fileURLToPath(new URL('./guarded-row.S',import.meta.url));
execFileSync(toolchain+'-gcc',['-x','assembler-with-cpp','-march=rv32im_xesppie','-mabi=ilp32','-nostdlib','-mno-relax',
    ...(mode==='matched'?['-DMATCHED_SCALAR']:[]),'-Wl,-Ttext=0','-Wl,-e,0',src,'-o',file('kernel.elf')]);
execFileSync(toolchain+'-objcopy',['-O','binary','-j','.text',file('kernel.elf'),file('kernel.bin')]);
const code=readFileSync(file('kernel.bin'));
const words=Array.from({length:code.length/4},(_,i)=>code.readUInt32LE(4*i));
const frontend=createContext({});
runInContext(readFileSync('picocalc-os/compiler/typed-wasm.js','utf8'),frontend);
const scene=readFileSync(typed,'utf8');
const {functions}=frontend.typedWasm.compileFunctions(scene,0,[],undefined,true);
const fn=functions.find(f=>f.name==='typedRayComputeRow');
if (!fn) throw Error('missing reference row');
const expected=Array.from(fn.code);
const digest=(await import('node:crypto')).createHash('sha256').update(JSON.stringify(expected)).digest('hex');
// Freeze the validated semantics independently of the source passed to the generator.
if(digest!=='ab7c7d8c0cd05beb8adb7e1a08368191cd044635da386677fed6d7156ad55477') throw Error('reference row IR not reviewed: '+digest);
const old='        code.push(lowerLeaf(fn, callables, targets) ?? new FunctionCode(fn, callables, targets).lower());';
const backend=readFileSync('picocalc-os/compiler/typed-rv32.js','utf8');
if(backend.split(old).length!==2) throw Error('unexpected backend');
const definitions='const rowIR='+JSON.stringify(expected)+';\nconst rowPrefix='+JSON.stringify(words)+';\n';
const inject=`        const result = lowerLeaf(fn, callables, targets) ?? new FunctionCode(fn, callables, targets).lower();
        if (${mode==='inferred'?'':'fn.name === "typedRayComputeRow" && '}fn.params.length === 2 && fn.params[0] === "buffer" && fn.params[1] === "i32" &&
            fn.result === "i32" && fn.nlocals === ${fn.nlocals} && fn.code.length === rowIR.length &&
            rowIR.every((cell, i) => fn.code[i] === cell)) {
            // Local labels stay relative to the stock body; global relative jumps move with it.
            const shifted = new Set();
            for (const jump of result.calls) {
                jump.from += rowPrefix.length;
                if (!jump.target.global && jump.target.importIndex === undefined && !shifted.has(jump.target)) {
                    jump.target.at += rowPrefix.length;
                    shifted.add(jump.target);
                }
            }
            result.words = rowPrefix.concat(result.words);
        }
        code.push(result);`;
writeFileSync(output,backend.replace('function compile(source,',definitions+'function compile(source,').replace(old,inject));
console.log(JSON.stringify({mode, rowIRCells:expected.length, rowIRSHA256:digest, prefixBytes:code.length,
    type:fn.result, scratchBytes:32, output}));
