// The last step: SLIR text to running machine code, through slas.
import { writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { printSlir } from './slir.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SLAS = join(ROOT, 'slas');

export function runSlas(ir, file) {
  if (!existsSync(SLAS)) throw new Error('slas is not built: run make');
  mkdirSync(join(ROOT, 'build'), { recursive: true });
  const out = join(ROOT, 'build', basename(file).replace(/\.js$/, '.slir'));
  writeFileSync(out, printSlir(ir));
  // a timeout, so that a compiler bug that makes a loop infinite fails instead of hanging
  return execFileSync(SLAS, [out], { encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'] });
}

// Chapter 26: ahead of time. slas -c writes the program as an ELF object, which is linked with
// the runtime alone (runtime/aot_main.c is slas's main without the assembler) and run.
const AOT = join(ROOT, 'build', 'aot');
function aotObjects() {
  mkdirSync(AOT, { recursive: true });
  const objs = [];
  for (const src of ['runtime.c', 'aot_main.c']) {
    const c = join(ROOT, 'runtime', src), o = join(AOT, src.replace(/\.c$/, '.o'));
    const stale = !existsSync(o) || statSync(c).mtimeMs > statSync(o).mtimeMs || statSync(join(ROOT, 'runtime', 'runtime.h')).mtimeMs > statSync(o).mtimeMs;
    if (stale) execFileSync(process.env.CC ?? 'cc', ['-std=gnu11', '-O2', '-Wall', `-I${join(ROOT, 'runtime')}`, '-c', c, '-o', o]);
    objs.push(o);
  }
  return objs;
}
export function runAot(ir, file) {
  if (!existsSync(SLAS)) throw new Error('slas is not built: run make');
  const objs = aotObjects();
  const base = join(ROOT, 'build', basename(file).replace(/\.js$/, ''));
  writeFileSync(`${base}.slir`, printSlir(ir));
  execFileSync(SLAS, ['-c', `${base}.o`, `${base}.slir`], { stdio: ['ignore', 'ignore', 'pipe'] });
  execFileSync(process.env.CC ?? 'cc', ['-no-pie', '-o', `${base}.aot`, `${base}.o`, ...objs, '-lm']);
  return execFileSync(`${base}.aot`, [], { encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'] });
}

// Chapter 29: rv32. slas-rv32 writes an object for the ESP32-P4's processor; the test machine
// (tools/rv32/emu.c) loads it against the test firmware (the C runtime built for rv32) and runs it.
const RV32 = join(ROOT, 'build', 'rv32');
export function runRv32(ir, file) {
  const tools = [join(ROOT, 'slas-rv32'), join(RV32, 'rv32emu'), join(RV32, 'fw-test.elf')];
  if (!tools.every((t) => existsSync(t))) throw new Error('the rv32 tools are not built: run make rv32');
  // (CJI-4: the programs in a folder of their own: tests/exceptions/runtime.js assembled to build/rv32/runtime.o
  // overwrote the firmware's runtime, and the next firmware link failed)
  mkdirSync(join(RV32, 'prog'), { recursive: true });
  const base = join(RV32, 'prog', basename(file).replace(/\.js$/, ''));
  writeFileSync(`${base}.slir`, printSlir(ir));
  execFileSync(tools[0], ['-c', `${base}.o`, `${base}.slir`], { stdio: ['ignore', 'ignore', 'pipe'] });
  return execFileSync(tools[1], [tools[2], `${base}.o`], { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] });
}
