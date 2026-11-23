#!/usr/bin/env node
// 11-patterns.mjs: executed instructions per sample in a few wasteful shapes, from a dump of 01-count.mjs --dump
// (PICOCALC-CANDELA-KERNEL-CODEGEN). usage: node 11-patterns.mjs DUMPDIR SCENE
//   storeReload   a store to sp+o (or s0+o) followed at once by a load from the same slot
//   moveChain     fmv.s/mv a, b followed at once by fmv.s/mv c, a
//   resultMove    a move out of fa0-fa7/a0-a7 right after a call (the result to the operand stack)
//   saveRestore   prologue saves and epilogue restores of callee-saved registers (sw/fsw s*,fs* at a function's start
//                 or lw/flw before its ret)
//   floatConst    lui + [addi] + fmv.w.x of a non-zero constant
//   capCheck      a capacity check: lw t1, 0(r) and the bltu after it
//   kLoad         a load of a K field: lw from the register that holds q_k (a0 on entry, its home after)
import { readFileSync } from 'node:fs';

const [dir, scene] = process.argv.slice(2);
const image = readFileSync(`${dir}/image.bin`);
const view = new DataView(image.buffer, image.byteOffset, image.byteLength);
const { samples, counts } = JSON.parse(readFileSync(`${dir}/${scene}.counts.json`, 'utf8'));
const entries = new Set(Object.values(JSON.parse(readFileSync(`${dir}/entries.json`, 'utf8'))));
const words = image.length >>> 2;
const w = i => view.getUint32(4 * i, true);
const f = x => ({ op: x & 0x7f, rd: (x >>> 7) & 31, f3: (x >>> 12) & 7, rs1: (x >>> 15) & 31, rs2: (x >>> 20) & 31, f7: x >>> 25,
  immI: x >> 20, immS: ((x >> 25) << 5) | ((x >>> 7) & 31) });
const isStore = d => (d.op === 0x23 || d.op === 0x27) && (d.rs1 === 2 || d.rs1 === 8);
const isLoad = d => (d.op === 0x03 || d.op === 0x07) && (d.rs1 === 2 || d.rs1 === 8);
const isMove = d => (d.op === 0x53 && d.f7 === 0x10 && d.f3 === 0 && d.rs1 === d.rs2) || (d.op === 0x13 && d.f3 === 0 && d.immI === 0 && d.rd !== 0);
const moveTo = d => d.op === 0x53 ? 32 + d.rd : d.rd, moveFrom = d => d.op === 0x53 ? 32 + d.rs1 : d.rs1;
const isCall = d => d.op === 0x6f && d.rd === 1;
const saved = r => r === 9 || (r >= 18 && r <= 27) || r === 40 || r === 41 || (r >= 50 && r <= 59);
const out = { storeReload: 0, moveChain: 0, resultMove: 0, saveRestore: 0, floatConst: 0, capCheck: 0, mul: 0, total: 0 };
let prologue = false;
for (let i = 0; i < words; i++) {
  const n = counts[i] / samples;
  if (entries.has(4 * i)) prologue = true;
  if (!n) { continue; }
  out.total += n;
  const d = f(w(i)), e = i + 1 < words ? f(w(i + 1)) : null, p = i > 0 ? f(w(i - 1)) : null;
  if (e && isStore(d) && isLoad(e) && d.rs1 === e.rs1 && d.immS === e.immI && counts[i + 1] === counts[i]) out.storeReload += n;
  if (p && isMove(d) && isMove(p) && moveFrom(d) === moveTo(p)) out.moveChain += n;
  if (isMove(d) && p && (isCall(p) || (isMove(p) && out._afterCall)) && ((moveFrom(d) >= 42 && moveFrom(d) <= 49) || (moveFrom(d) >= 10 && moveFrom(d) <= 17))) { out.resultMove += n; out._afterCall = true; }
  else out._afterCall = Boolean(p && isCall(p) && isMove(d));
  if (d.op === 0x03 && d.rd === 6 && d.immI === 0 && e && e.op === 0x63 && e.f3 === 6) out.capCheck += 2 * n;
  if (d.op === 0x33 && d.f7 === 1 && d.f3 === 0) out.mul += n;
  const reg = d.op === 0x27 || d.op === 0x07 ? 32 + (d.op === 0x27 ? d.rs2 : d.rd) : (d.op === 0x23 ? d.rs2 : d.rd);
  if (prologue && isStore(d) && d.rs1 === 2 && saved(reg)) out.saveRestore += n;
  else if (!isStore(d) || d.rs1 !== 2) prologue = prologue && (isStore(d) || (d.op === 0x13 && d.rd === 2));
  if (isLoad(d) && d.rs1 === 2 && saved(reg)) { let k = i + 1; while (k < words && isLoad(f(w(k)))) k++; const r = f(w(k)); if ((r.op === 0x13 && r.rd === 2) || (r.op === 0x67)) out.saveRestore += n; }
  if (d.op === 0x53 && d.f7 === 0x78 && d.rs1 !== 0) { out.floatConst += n; if (p && (p.op === 0x37 || p.op === 0x13)) out.floatConst += n; if (p && p.op === 0x13 && i > 1 && f(w(i - 2)).op === 0x37) out.floatConst += n; }
}
delete out._afterCall;
console.log(JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, +v.toFixed(1)]))));
