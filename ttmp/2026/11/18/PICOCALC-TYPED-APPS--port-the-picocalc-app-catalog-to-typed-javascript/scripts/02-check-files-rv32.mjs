import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import '../../../../../../picocalc-os/compiler/typed-wasm.js';
import '../../../../../../picocalc-os/compiler/typed-rv32.js';
import '../../../../../../picocalc-os/worlds/files/compile.js';

const [cc, emu] = process.argv.slice(2);
assert(cc && emu, 'pass the ESP32-P4 cross-compiler and CJI rv32emu');
const dir = mkdtempSync(join(tmpdir(), 'files-rv32-'));
try {
    const sdk = 'picocalc-os/sdk', world = 'picocalc-os/worlds/files';
    const reactor = join(dir, 'reactor.elf'), module = join(dir, 'files.so'), driver = join(dir, 'driver.elf');
    execFileSync(cc, [
        '-march=rv32imafc_zicsr_zifencei', '-mabi=ilp32f', '-Os', '-fPIC', '-shared', '-nostartfiles',
        '-nostdlib', '-e', 'app_main', '-ffunction-sections', '-fdata-sections', '-Wl,--gc-sections',
        '-fvisibility=hidden', '-Wl,--strip-all', '-Wl,-z,max-page-size=16', '-Wno-attributes',
        '-I', sdk, '-o', reactor, join(world, 'world.c'), join(world, 'rv32-slot.S'), join(sdk, 'nw_elf.c'),
    ], {stdio:'inherit'});
    const bytes = compileFilesRv32(readFileSync(join(world, 'files.typed'), 'utf8'), readFileSync(reactor));
    writeFileSync(module, bytes);
    execFileSync(cc, [
        '-march=rv32im', '-mabi=ilp32', '-O2', '-fno-builtin', '-msmall-data-limit=0',
        '-mno-relax', '-nostdlib', '-Wl,-Ttext=0x10000', '-Wl,-e,_start', '-I', sdk,
        '-o', driver, fileURLToPath(new URL('02-files-rv32-driver.c', import.meta.url)),
        ...['libc.o', 'hostcalls.o', 'softfloat.o'].map(file => join(dirname(emu), file)),
    ], {stdio:'inherit'});
    const result = execFileSync(emu, [driver, module], {encoding:'utf8',timeout:15000}).trim();
    assert.equal(result, 'Files RV32 startup, directory sorting, rounding, and mkdir passed');
    console.log(JSON.stringify({elfBytes: bytes.length, result}));
} finally {
    rmSync(dir, {recursive:true,force:true});
}
