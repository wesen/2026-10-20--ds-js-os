// disasm.js: a listing of a section bytecode blob (version 1). Pure JavaScript, QuickJS-compatible.
// Decodes with the same operand table as the C verifier (isa.js), so a listing that decodes is a blob whose
// instruction boundaries the verifier also finds.
import * as ISA from './isa.js';

export function decodeHeader(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const h = { magic: dv.getUint32(0, true), version: dv.getUint16(4, true), flags: dv.getUint16(6, true), nregs: dv.getUint16(8, true),
    nconst: dv.getUint16(10, true), nimport: dv.getUint16(12, true), ncode: dv.getUint16(14, true), kmask: dv.getUint32(16, true), entries: [] };
  for (let i = 0; i < ISA.ENTRIES.length; i++) {
    const at = 20 + 12 * i, g = k => dv.getUint16(at + 2 * k, true);
    h.entries.push({ name: ISA.ENTRIES[i].name, pc: g(0), end: g(1), lo: g(2), hi: g(3), arg: g(4), ret: g(5) });
  }
  let at = 20 + 12 * ISA.ENTRIES.length;
  h.consts = []; for (let i = 0; i < h.nconst; i++) { h.consts.push(dv.getUint32(at, true)); at += 4; }
  h.imports = []; for (let i = 0; i < h.nimport; i++) { h.imports.push({ reg: dv.getUint16(at, true), row: dv.getUint16(at + 2, true) }); at += 4; }
  h.code = []; for (let i = 0; i < h.ncode; i++) { h.code.push(dv.getUint16(at, true)); at += 2; }
  return h;
}

const fbits = (() => { const u = new Uint32Array(1), f = new Float32Array(u.buffer); return w => { u[0] = w; return f[0]; }; })();
const widthOf = (spec, H) => {
  const k = spec.slice(1);
  if (k === 'L') return ISA.LOBE_WORDS; if (k === 'H') return ISA.HIT_WORDS;
  if (k === 'w') return H & 7 || (H & 63);
  if (k === 'a') return H & 8 ? 1 : H & 7; if (k === 'b') return H & 16 ? 1 : H & 7; if (k === 'c') return H & 32 ? 1 : H & 7;
  return +k;
};

// operand list of the instruction at pc: [{ kind, width, value }]
export function operands(code, pc) {
  const w0 = code[pc], o = ISA.OPS[w0 & 255], H = w0 >> 8;
  if (!o) return null;
  const a = [];
  const take = (kind, width) => { a.push({ kind, width, value: code[pc + 1 + a.length] }); };
  if (o.sig) { for (const s of o.sig) take(s[0], s[0] === 't' || s[0] === 'i' ? 0 : o.wide && s.endsWith('w') ? H : widthOf(s, H)); return { o, H, a }; }
  switch (o.special) {
    case 'switch': { take('s', 1); take('i', 0); const n = code[pc + 2]; for (let i = 0; i <= n; i++) take('t', 0); break; }
    case 'gather': take('d', H); take('s', 1); take('i', 0); break;
    case 'hld': take('d', H); take('i', 0); break;
    case 'hbool': take('d', 1); take('s', 1); take('i', 0); break;
    case 'gld': take('d', 1); break;
    case 'lobe': {
      take('d', ISA.LOBE_WORDS); take('i', 0);
      const mask = code[pc + 2];
      ISA.LOBE_ORDER.forEach((f, i) => { if (mask & (1 << i)) take('s', ISA.LOBE_FIELDS[f][1]); });
      break;
    }
    case 'call': { const f = ISA.KFUNCS[H]; if (!f) return null; for (const s of f.sig) take(s[0] === 'h' ? 'h' : s[0], s[0] === 'i' || s[0] === 'h' ? 0 : widthOf(s, H)); break; }
  }
  return { o, H, a };
}

export function listing(bytes) {
  const h = decodeHeader(bytes);
  const out = [];
  out.push(`; section bytecode v${h.version}, ${bytes.length} bytes: ${h.nregs} register words (${h.nconst} constant), ${h.nimport} uniform imports, ${h.ncode} code halfwords${h.flags & 1 ? ', spectral' : ''}`);
  out.push('; kernel functions: ' + ISA.KFUNCS.filter((f, i) => h.kmask & (1 << i)).map(f => f.name).join(', '));
  h.imports.forEach(im => out.push(`;   r${im.reg}..r${im.reg + 3} = U(${im.row})`));
  const cstr = h.consts.map((w, i) => `r${i}=${fbits(w)}`).filter((_, i) => !h.imports.some(im => i >= im.reg && i < im.reg + 4));
  for (let i = 0; i < cstr.length; i += 8) out.push(';   ' + cstr.slice(i, i + 8).join(' '));
  const entryAt = new Map(h.entries.map(e => [e.pc, e]));
  let pc = 0;
  while (pc < h.ncode) {
    if (entryAt.has(pc)) { const e = entryAt.get(pc); out.push(`${e.name}:   ; frame r${e.lo}..r${e.hi - 1}, arguments at r${e.arg}, result at r${e.ret}`); }
    const d = operands(h.code, pc);
    if (!d) { out.push(`  ${String(pc).padStart(5)}  ??? ${h.code[pc]}`); break; }
    const name = d.o.name === 'CALL' ? 'CALL ' + ISA.KFUNCS[d.H].name : d.o.generic || d.o.wide || ['GATHER', 'HLD', 'GLD', 'CHECKER'].includes(d.o.name) ? `${d.o.name}.${d.H}` : d.o.name;
    const args = d.a.map(x => x.kind === 't' ? '@' + x.value : x.kind === 'i' ? '#' + x.value : x.kind === 'h' && x.value === ISA.HIT_IN ? 'h' : 'r' + x.value + (x.width > 1 ? ':' + x.width : ''));
    out.push(`  ${String(pc).padStart(5)}  ${name.padEnd(14)} ${args.join(', ')}`);
    pc += 1 + d.a.length;
  }
  return out.join('\n');
}
