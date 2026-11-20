/* Run the linked internal preview helper directly in the project RV32 emulator. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import vm from 'node:vm';
const [dir, gcc, emu] = process.argv.slice(2);
const work=resolve(dir), out=join(work,'guest-replay');
mkdirSync(out,{recursive:true});
const compiler=vm.createContext({});
for (const name of ['wasm','rv32','world'])
    vm.runInContext(readFileSync(join(work,'stock',name+'.js'),'utf8'),compiler);
vm.runInContext(readFileSync(join(work,'candidate/endpoint.js'),'utf8'),compiler);
const build=join(work,'build/esp-idf/main');
const sources=compiler.editorEdits(readFileSync(join(build,'editor.typed'),'utf8')).sequence;
const reactor=readFileSync(join(build,'typed-world-reactor.elf'));
const oracle=JSON.parse(readFileSync(join(work,'host.json'),'utf8'));
const results=[];
for (const [index,src] of sources.entries()) {
    const site=oracle.rows[index];
    const bytes=Buffer.from(compiler.compileTypedWorldRv32(src,reactor));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),site.elf);
    const pos=index===0 ? 200 : 198;
    writeFileSync(join(out,'editor.elf'),bytes);
    writeFileSync(join(out,'start.S'),`
      .section .text.start,"ax",@progbits
      .global _start
    _start:
      call test
      li a7,1
      ecall
      .balign 4
      .global image
    image:
      .incbin "editor.elf"
    `);
    writeFileSync(join(out,'driver.c'),`
      extern const unsigned char image[];
      typedef int (*Finish)(void *,int *,int);
      struct { unsigned length; unsigned short units[256]; } buffer = {.length=256};
      int state[80];
      int test(void) {
        state[${site.rows}]=2; state[${site.units}]=5; state[${site.columns}]=7;
        int result=((Finish)(image+${site.entry}))(&buffer,state,4);
        return result!=0 || buffer.units[${pos}]!=5 || buffer.units[${pos+1}]!=4 ||
          state[${site.rows}]!=3 || state[${site.units}]!=0 || state[${site.columns}]!=0;
      }
    `);
    execFileSync(resolve(gcc),['-march=rv32im','-mabi=ilp32','-O2','-fno-builtin','-msmall-data-limit=0',
        '-mno-relax','-nostdlib','-Wl,-Ttext=0x10000','-Wl,-e,_start','-o','driver.elf','start.S','driver.c'],{cwd:out});
    execFileSync(resolve(emu),[join(out,'driver.elf')],{timeout:10000});
    results.push({index,elf:site.elf,entry:site.entry,rowsWord:site.rows,unitsWord:site.units,headerAt:pos});
}
console.log(JSON.stringify({emulator:'CJI rv32emu',results},null,2));
