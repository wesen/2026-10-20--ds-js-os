// index.js: the section translator's entry points (design Section 4). Pure JavaScript, QuickJS-compatible:
// no Node or browser API, output is a Uint8Array.
//
//   translateProgram(shared, kernelModule, opts)   split compiled.shared (split.js), then translateSections
//   translateSections(fieldCode, matCode, opts)    opts.spectral: the program's SPECTRAL_ON
// Both return { ok, bytes, diagnostics, stats }. A diagnostic is { code, construct, message, where: { file, line, col } }.
import * as ISA from './isa.js';
import { parse, SectionError } from './parse.js';
import { Lowerer, VReg, INLINE_KERNEL_WGSL, WIDTH, endsInTerminator } from './lower.js';
import { resolveAliases, dce, fuse, thread, allocate, placeConstants, encodeEntry, assemble } from './emit.js';
import { splitProgram } from './split.js';

export { ISA, splitProgram };

const f32bits = (() => { const f = new Float32Array(1), u = new Uint32Array(f.buffer); return v => { f[0] = v; return u[0]; }; })();
const FLOATY = new Set(['f32', 'vec2f', 'vec3f', 'vec4f']);

class Program {
  constructor(fns, spectral, kernelApi) {
    this.fns = fns; this.spectral = spectral; this.nv = 0; this.kernelApi = kernelApi; this.effectMemo = new Map();
    this.constList = []; this.constMap = new Map(); this.importList = []; this.importMap = new Map(); this.kernelAst = new Map();
  }
  newVReg(w, kind) { return new VReg(this.nv++, w, kind); }
  // does evaluating this expression or statement list call a kernel function with side effects (directly, through a
  // generated function, or through a pattern such as toWorld(frameOf(N), cosHemi(rnd2())))?
  hasEffects(node) {
    if (!node) return false;
    if (Array.isArray(node)) return node.some(n => this.hasEffects(n));
    switch (node.k) {
      case 'call': {
        const n = node.callee;
        if (ISA.KFUNC[n] !== undefined && ISA.KFUNCS[ISA.KFUNC[n]].effects) return true;
        if (ISA.KERNEL_SIDE_EFFECTS.includes(n)) return true;
        if (this.fns.has(n)) {
          if (!this.effectMemo.has(n)) { this.effectMemo.set(n, false); this.effectMemo.set(n, this.hasEffects(this.fns.get(n).body)); }
          if (this.effectMemo.get(n)) return true;
        }
        return node.args.some(a => this.hasEffects(a));
      }
      case 'member': return this.hasEffects(node.obj);
      case 'un': return this.hasEffects(node.a);
      case 'bin': return this.hasEffects(node.a) || this.hasEffects(node.b);
      case 'let': case 'var': return this.hasEffects(node.init);
      case 'assign': return this.hasEffects(node.target) || this.hasEffects(node.value);
      case 'if': return this.hasEffects(node.cond) || this.hasEffects(node.then) || this.hasEffects(node.else);
      case 'return': return this.hasEffects(node.value);
      case 'expr': return this.hasEffects(node.e);
      case 'block': return this.hasEffects(node.body);
    }
    return false;
  }
  constOperand(v) {
    let words;
    if (FLOATY.has(v.t)) words = v.c.map(f32bits);
    else if (v.t === 'i32' || v.t === 'bool') words = v.c.map(x => x >>> 0);
    else throw new Error('translator: constant of type ' + v.t + ' reached an operand');
    const key = words.join(',');
    let r = this.constMap.get(key);
    if (!r) { r = this.newVReg(words.length, 'const'); r.words = words; this.constList.push(r); this.constMap.set(key, r); }
    return { r, o: 0 };
  }
  importRow(row, at) {
    if (!(row >= 0 && row < 65536)) throw new SectionError('E-SECT-LIMIT', 'limit:uniform-row', `U(${row}) outside the uniform buffer`, at);
    let r = this.importMap.get(row);
    if (!r) { r = this.newVReg(4, 'import'); r.row = row; this.importList.push(r); this.importMap.set(row, r); }
    return { t: 'vec4f', r, o: 0 };
  }
  kernelFn(name) {
    if (!this.kernelAst.has(name)) this.kernelAst.set(name, parse(INLINE_KERNEL_WGSL[name], 'kernel:' + name)[0]);
    return this.kernelAst.get(name);
  }
}

function diag(e) {
  if (e instanceof SectionError) return { code: e.code, construct: e.construct, message: e.message, where: e.where };
  return { code: 'E-SECT-INTERNAL', construct: 'internal', message: String(e && e.stack || e), where: null };
}

export function translateSections(fieldCode, matCode, opts = {}) {
  const stats = { entries: {}, fusions: {} };
  try {
    const fns = new Map();
    for (const [file, src] of [['field.wgsl', fieldCode], ['mat.wgsl', matCode]]) {
      for (const f of parse(src, file)) {
        if (fns.has(f.name)) throw new SectionError('E-SECT-SYNTAX', 'function:duplicate', `function ${f.name} defined twice`, f.at);
        fns.set(f.name, f);
      }
    }
    // opts.kernelApi: the section API the target kernel exports (default: ISA.SECTION_API, the generated kernel's), or 'all'
    const api = opts.kernelApi === 'all' ? ISA.KFUNCS.map(f => f.name) : (opts.kernelApi || ISA.SECTION_API);
    const prog = new Program(fns, !!opts.spectral, new Set(api));
    const lowered = [];
    for (const E of ISA.ENTRIES) {
      const ast = fns.get(E.name);
      if (!ast) throw new SectionError('E-SECT-SYNTAX', 'entry:missing', `the sections do not define ${E.name}`, null);
      const want = (E.hitParam ? [['h', 'Hit']] : []).concat(E.args);
      if (ast.params.length !== want.length || ast.params.some((p, i) => p.type.name !== want[i][1]) || (ast.ret && ast.ret.name) !== E.ret)
        throw new SectionError('E-SECT-TYPE', 'entry:signature', `${E.name} has an unexpected signature`, ast.at);
      const L = new Lowerer(prog, E);
      const argW = E.args.reduce((s, [, t]) => s + WIDTH[t], 0);
      const argR = prog.newVReg(argW, 'arg'), retR = prog.newVReg(WIDTH[E.ret], 'ret');
      const argVals = []; let o = 0;
      if (E.hitParam) argVals.push({ t: 'Hit', hitIn: true });
      for (const [, t] of E.args) { argVals.push({ t, r: argR, o }); o += WIDTH[t]; }
      const retDest = { t: E.ret, r: retR, o: 0 };
      L.inline(ast, argVals, { retDest, onReturn: (v) => { L.into(retDest, v); L.emit('RET', []); } });
      if (!endsInTerminator(L.code)) L.emit('RET', []);
      const before = L.code.filter(i => i.op !== 'LABEL').length;
      resolveAliases(L.code); dce(L.code); fuse(L.code, stats.fusions); dce(L.code); thread(L.code);
      lowered.push({ E, L, argR, retR, irBefore: before });
    }
    for (const { L } of lowered) for (const ins of L.code) for (const x of ins.a) if (x && x.r && x.r.kind === 'const') x.r.used = true;
    const { words, imports } = placeConstants(prog);
    let base = words.length;
    const entries = [];
    for (const { E, L, argR, retR } of lowered) {
      const size = allocate(L.code, argR, retR, base);
      entries.push({ E, L, lo: base, hi: base + size, arg: argR.base, ret: retR.base });
      base += size;
    }
    if (base > ISA.MAX_REGS) throw new SectionError('E-SECT-LIMIT', 'limit:registers', `the program needs ${base} register words (limit ${ISA.MAX_REGS})`, null);
    let code = [];
    for (const e of entries) {
      e.pc = code.length;
      code = code.concat(encodeEntry(e.L.code, e.pc));
      e.end = code.length;
      if (code.length > ISA.MAX_CODE) throw new SectionError('E-SECT-LIMIT', 'limit:code', `the program needs more than ${ISA.MAX_CODE} code halfwords`, null);
    }
    let kmask = 0;
    for (const e of entries) for (const k of e.L.kfuncs) kmask |= 1 << ISA.KFUNC[k];
    for (const e of entries) for (const ins of e.L.code) if (ins.op === 'FRESDOT') kmask |= 1 << ISA.KFUNC.fresnelDielectric;
    const bytes = assemble({ flags: opts.spectral ? 1 : 0, nregs: base, constWords: words, imports, kmask, entries, code });
    for (const e of entries) {
      const ins = e.L.code.filter(i => i.op !== 'LABEL');
      const ops = {}; for (const i of ins) ops[i.op] = (ops[i.op] || 0) + 1;
      stats.entries[e.E.name] = { instructions: ins.length, halfwords: e.end - e.pc, frameWords: e.hi - e.lo, ops };
    }
    stats.constWords = words.length; stats.imports = imports.length; stats.registerWords = base; stats.codeHalfwords = code.length; stats.bytes = bytes.length;
    stats.kernelFunctions = ISA.KFUNCS.filter((f, i) => kmask & (1 << i)).map(f => f.name);
    return { ok: true, bytes, diagnostics: [], stats };
  } catch (e) {
    return { ok: false, bytes: null, diagnostics: [diag(e)], stats };
  }
}

export function translateProgram(shared, K, opts = {}) {
  let s;
  try { s = splitProgram(shared, K); } catch (e) { return { ok: false, bytes: null, diagnostics: [{ code: 'E-SECT-SPLIT', construct: 'program:layout', message: e.message, where: null }], stats: {} }; }
  return translateSections(s.fieldCode, s.matCode, Object.assign({ spectral: s.spectral }, opts));
}
