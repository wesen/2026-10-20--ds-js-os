// Build the supported public compiler mode from this checkout, preserving its
// exact bytes in the measurement image and publishing identities before timing.
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createContext,runInContext} from 'node:vm';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const ticket=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const out=process.argv[2];
assert(out,'pass an existing output directory from the repository root');
const hash=b=>createHash('sha256').update(b).digest('hex');
const sourceFile='picocalc-os/worlds/raytrace/raytrace.typed', files={};
function content(file){const b=readFileSync(file);files[file]=hash(b);return b.toString();}
const realm=createContext({});
for(const n of ['typed-wasm','typed-rv32','typed-pie-loops'])runInContext(content('picocalc-os/compiler/'+n+'.js'),realm);
const program=realm.typedRv32.compile(content(sourceFile),[],undefined,{pieLoops:'pie-empty'});
assert.equal(program.importCount,0);assert.equal(program.relocations.length,0);
const img=Buffer.from(program.image);
const golden=JSON.parse(readFileSync(join(ticket,'various/director/packet-images.json'),'utf8')).arms.empty.imageSHA;
assert.equal(hash(img),golden,'qualification requires byte identity with the supported empty-exit image');
const asm=['.section .text.current_typed_frame,"ax",@progbits','.balign 16','.option push','.option norvc'];
for(let i=0;i<img.length;i+=4){
    for(const [entry,label] of Object.entries({typedRayFrame:'clean',typedRayTrace:'primary'}))
        if(program.entries[entry]===i)asm.push('.global current_'+label,'current_'+label+':');
    asm.push('.4byte 0x'+img.readUInt32LE(i).toString(16));
}
writeFileSync(join(out,'current-frame.S'),asm.concat('.option pop','').join('\n'));
const fixtureFile=join(ticket,'various/director/frame-fixtures.json');
const fixtures=JSON.parse(readFileSync(fixtureFile));
const rows=fixtures.map(f=>'{'+JSON.stringify(f.fixture)+','+[...f.pose,f.stride,...f.hashes.map(x=>x+'u')].join(',')+'}');
writeFileSync(join(out,'current_fixtures.h'),'static const frame_case fixtures[]={\n'+rows.join(',\n')+'\n};\n');
for(const f of ['raytrace_demo.c','raytrace_demo.h','raytrace_demo_pie.S'])content('picocalc-os/nucleus/'+f);
const manifest={repo:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),mode:'pie-empty',imageSHA256:hash(img),
    bytes:img.length,entries:{clean:program.entries.typedRayFrame,primary:program.entries.typedRayTrace},
    fixtureSHA256:hash(readFileSync(fixtureFile)),files};
writeFileSync(join(out,'c-frame-inputs.json'),JSON.stringify(manifest,null,2)+'\n');
