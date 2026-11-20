import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

export function decode(image, prefix) {
    const dir = mkdtempSync(join(tmpdir(),'typed-pie-disasm-'));
    try {
        writeFileSync(join(dir,'image.bin'),image);
        writeFileSync(join(dir,'wrapper.s'),'.text\n.option norvc\n.incbin "image.bin"\n');
        execFileSync(prefix+'-as',['-march=rv32im_xesppie','-mabi=ilp32','-o','image.o','wrapper.s'],{cwd:dir});
        const disasm = execFileSync(prefix+'-objdump',['-D','-j','.text','-M','numeric,no-aliases','image.o'],{cwd:dir,encoding:'utf8'});
        const lines = new Map();
        for (const line of disasm.split('\n')) {
            const m = line.match(/^\s*([0-9a-f]+):\s+([a-f0-9]{8})\s+(\S+)\s*(.*?)\s*$/);
            if (m) lines.set(parseInt(m[1],16),{word:parseInt(m[2],16),op:m[3],args:m[4].split(',')});
        }
        if (lines.size*4 !== image.length) throw Error('vendor disassembly did not consume fixed-width image');
        return lines;
    } finally {
        rmSync(dir,{recursive:true,force:true});
    }
}
