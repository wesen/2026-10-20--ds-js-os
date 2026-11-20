#!/usr/bin/env node
// CJI-4 (chapter 30): the world runtime's unit as the board's firmware would hold it.
//
//   node tools/rv32/unit.mjs slir prelude-unit.slir > unit.slir
//   node tools/rv32/unit.mjs ilp32 unit.o unit-ilp32.o
//   node tools/rv32/unit.mjs c unit.list NAME > unit_list.c
//
// slir: the functions of the runtime's unit (cji.js - --prelude-unit, chapter 32) as a shared unit, as
// tools/nw-share.mjs --units makes it: every function, its main as $main$prelude (tools/link-units.mjs),
// which a world without a snapshot calls at its start. slas-rv32 -c unit.o --lib unit.list assembles it.
//
// ilp32: a copy of an object slas-rv32 wrote with its float-ABI flag set to soft (ilp32). slas-rv32 says
// ilp32f, as the board's ABI is; the test firmware is ilp32 because the emulator has no F extension, and
// ld.lld will not link objects whose float ABIs differ. The code is the same under both (chapter 29: it
// passes no single float and uses no floating-point register), so only the flag changes.
import { readFileSync, writeFileSync } from 'node:fs';
import { linkUnits } from '../link-units.mjs';

const [cmd, a, b] = process.argv.slice(2);
if (cmd === 'slir' && a) {
  const text = linkUnits(readFileSync(a, 'utf8'), 'function main/0\nstart:\nend\n');
  const fns = text.split(/^(?=function )/m).filter((f) => f.startsWith('function ') && !f.startsWith('function main/'));
  process.stdout.write(fns.join(''));
} else if (cmd === 'ilp32' && a && b) {
  const o = readFileSync(a);
  if (o.readUInt32BE(0) !== 0x7f454c46 || o[4] !== 1 || o.readUInt16LE(18) !== 243) throw new Error(`${a}: not an ELF32 RISC-V object`);
  o.writeUInt32LE(o.readUInt32LE(36) & ~0x6, 36);   // EF_RISCV_FLOAT_ABI: soft
  writeFileSync(b, o);
} else if (cmd === 'c' && a && b) {   // (CJI-4 part 2: the unit's list as data in the board's firmware, for slas --extern)
  const bytes = readFileSync(a);
  process.stdout.write(`/* ${a}, for slas on the board (tools/rv32/unit.mjs c) */\n#include <stddef.h>\n`
    + `const char ${b}[] = {${Array.from(bytes).join(',')},0};\nconst unsigned ${b}_len = ${bytes.length};\n`);
} else {
  console.error('usage: node tools/rv32/unit.mjs slir prelude-unit.slir | ilp32 IN.o OUT.o | c unit.list NAME');
  process.exit(2);
}
