import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

import '../../../../../../picocalc-os/compiler/typed-wasm.js';
import '../../../../../../picocalc-os/compiler/typed-rv32.js';
import '../../../../../../picocalc-os/worlds/agenda/compile.js';

const [cc, emu, reactorPath] = process.argv.slice(2);
assert(cc && emu && reactorPath, 'pass the RV32 compiler, repository rv32emu, and P4 agenda-reactor.elf');
const work = mkdtempSync(join(tmpdir(), 'agenda-rv32-world-'));
try {
    const source = ['reminder', 'entry'].map(
        name => readFileSync('picocalc-os/worlds/agenda/' + name + '.typed', 'utf8')
    ).join('\n');
    const module = compileAgendaRv32(source, readFileSync(reactorPath));
    const driver = join(work, 'driver.elf');
    const app = join(work, 'agenda.so');
    const runner = fileURLToPath(new URL('08-rv32-world-runner.c', import.meta.url));
    writeFileSync(app, module);
    execFileSync(cc, [
        '-march=rv32im', '-mabi=ilp32', '-O2', '-fno-builtin', '-msmall-data-limit=0',
        '-mno-relax', '-nostdlib', '-Wl,-Ttext=0x10000', '-Wl,-e,_start',
        '-I', 'picocalc-os/sdk', '-o', driver, runner,
        ...['libc.o', 'hostcalls.o', 'softfloat.o'].map(file => join(dirname(emu), file)),
    ], {stdio: 'inherit'});
    const result = execFileSync(emu, [driver, app, app], {encoding: 'utf8'}).trim();
    assert.equal(result, 'frames=4 reminders=1 writes=1 durable_restart=pass grouped_navigation=pass');
    console.log(JSON.stringify({
        module_bytes: module.length,
        module_sha256: createHash('sha256').update(module).digest('hex'),
        result,
        boundary: 'Relocated RV32 instructions and SDK ABI under emulation, with deterministic filesystem, clock and storage stubs',
    }, null, 2));
} finally {
    rmSync(work, {recursive: true, force: true});
}
