import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import '../../../../../../picocalc-os/compiler/typed-wasm.js';

const os = resolve('picocalc-os');
const host = process.argv[2] ? resolve(process.argv[2]) : join(os, 'build/picocalc-host');
const tools = join(os, 'build/wasm-toolchain');
const sysroot = join(tools, 'root/usr');
const sdk = join(os, 'sdk');
const world = join(os, 'worlds/agenda');
const scratch = mkdtempSync(join(tmpdir(), 'picocalc-agenda-wasm-'));
const runtime = join(scratch, 'runtime.wasm');
const asset = join(scratch, 'agenda.wasm');
const fsRoot = join(scratch, 'fs');
const out = join(scratch, 'out');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

execFileSync('clang-18', [
    '--target=wasm32-wasi', '--sysroot=' + sysroot, '-resource-dir', join(tools, 'res'),
    '-B' + join(sysroot, 'lib/llvm-18/bin'), '-O2', '-Wall', '-I' + sdk,
    '-mexec-model=reactor', '-Wl,--stack-first', '-Wl,-z,stack-size=16384', '-Wl,--strip-all',
    join(world, 'wasm-world.c'), join(world, 'wasm-slot.c'), join(sdk, 'nw_wasm.c'), '-o', runtime,
], {stdio: ['ignore', 'inherit', 'inherit']});

const source = readFileSync(join(world, 'reminder.typed'), 'utf8');
const object = readFileSync(runtime);
const {bytes, records} = typedWasm.linkWorld(source, object, 'parseTask');
assert(WebAssembly.validate(bytes));
assert.throws(() => typedWasm.linkWorld(source.replace('title: buffer, task: Task): bool {\n    if (!scanTask',
    'title: buffer, task: Task, unused: i32): bool {\n    if (!scanTask'), object, 'parseTask'), /slot signature mismatch/);
assert.deepEqual(Object.entries(records.Task), [
    ['done', 'bool'], ['textStart', 'i32'], ['dueStart', 'i32'], ['dueEnd', 'i32'], ['timeStart', 'i32'],
    ['dateValid', 'bool'], ['timeValid', 'bool'], ['leadStart', 'i32'], ['leadEnd', 'i32'], ['leadMinutes', 'i32'],
    ['titleLength', 'i32'],
].map(([name,type], i) => [name, {type,offset:i*4}]));
writeFileSync(asset, bytes);

mkdirSync(join(fsRoot, 'notes'), {recursive: true});
writeFileSync(join(fsRoot, 'notes/todo.txt'), '# Tasks\n- [ ] dentist 🦷 @2026-11-03 14:30 !15m\n- [x] done\n- book a train\n');
writeFileSync(join(scratch, 'prelude.js'), readFileSync(join(os, 'js/prelude.js')));
writeFileSync(join(scratch, 'system.json'), JSON.stringify({worlds:[
    {name:'agenda-wasm',file:'agenda.wasm',engine:'wasm',claims:['fs:/notes'],mem_kb:384,budget_ms:100},
    {name:'peer',file:'peer.js',claims:['frames.read','sys.read'],mem_kb:512},
]}));
writeFileSync(join(scratch, 'peer.js'), `
service("peer")
  .needs("frames")
  .on("frames", (s, frame, msg) => { if (msg.from === "agenda-wasm") log("AGENDA_FRAME " + JSON.stringify(frame.frame.tree)); })
  .onStart(async () => {
    await sleep(30);
    const result = await ask("agenda-wasm", "agenda.parse", {line: "- [ ] dentist 🦷 @2026-11-03 14:30 !15m"});
    log("AGENDA_REPLY " + JSON.stringify(result));
    const world = sys.worlds().find(w => w.name === "agenda-wasm");
    log("AGENDA_ENGINE " + JSON.stringify([world.engine, world.state, world.kind]));
    try {
      await ask("agenda-wasm", "agenda.parse", {line: 7});
    } catch (e) { log("AGENDA_REJECT " + e.message); }
  });
`);
execFileSync(host, ['-vv', '-j', scratch, '-o', out, '-f', fsRoot, '-t', '1000'],
    {stdio:['ignore','pipe','pipe'],timeout:15000});
const log = readFileSync(join(out, 'uart.log'), 'utf8');
const manifest = JSON.parse(readFileSync(join(scratch, 'system.json'), 'utf8'));
delete manifest.worlds[0].claims;
writeFileSync(join(scratch, 'system.json'), JSON.stringify(manifest));
const deniedOutput = join(scratch, 'denied');
execFileSync(host, ['-vv', '-j', scratch, '-o', deniedOutput, '-f', fsRoot, '-t', '1000'],
    {stdio:['ignore','pipe','pipe'],timeout:15000});
const denied = readFileSync(join(deniedOutput, 'uart.log'), 'utf8');
assert.match(denied, /Agenda could not start its notes read/);
assert.doesNotMatch(denied, /AGENDA_FRAME/);
assert.doesNotMatch(log, /crashed/);
const jsonLine = key => JSON.parse(log.match(new RegExp(key + ' (.+)$','m'))[1]);
assert.deepEqual(jsonLine('AGENDA_REPLY'),
    {title:'dentist 🦷',done:false,dateValid:true,timeValid:true,leadMinutes:15});
assert.deepEqual(jsonLine('AGENDA_FRAME'), {t:'col',kids:[{t:'text',s:'dentist 🦷'},{t:'text',s:'book a train'}]});
assert.match(log, /agenda-wasm: \d+ WebAssembly instructions \(event 4\)/);
assert.deepEqual(jsonLine('AGENDA_ENGINE'), ['wasm','idle','app']);
assert.match(log, /AGENDA_REJECT expected a bounded Agenda line/);
const instructions = [...log.matchAll(/agenda-wasm: (\d+) WebAssembly instructions \(event 0, agenda.parse\)/g)]
    .map(match => Number(match[1]));
assert.equal(instructions.length, 2);
console.log(JSON.stringify({linkedBytes:bytes.length, sourceSha:sha(source), runtimeSha:sha(object),
    linkedSha:sha(bytes), reply:jsonLine('AGENDA_REPLY'), frame:jsonLine('AGENDA_FRAME'),
    engine:jsonLine('AGENDA_ENGINE'), deniedWithoutNotesClaim:true, perMessageInstructions:instructions}, null, 2));
