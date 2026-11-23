// program.mjs: Candela's fixed kernel and the gallery's scene sections as one Typed program (PICOCALC-CANDELA-TYPED).
//
// generateTypedProgram(kernelWGSL, scenes, opts) returns { types, kernel, scenes, glue, layout, stats }: four Typed
// sources (the records first, as Typed requires) to be concatenated with compiler/typed/lib/math.typed after `types`.
//   - The kernel is Candela's fixed WGSL with the C++ kernel's CPU substitutions: hash3/hash13 as pcg3d of the
//     inputs' bits (CDL_INT_HASH), voronoi3's cell hash through hash13, skyL through a 64 x 64 table (CDL_SKY_TABLE),
//     floor/fract/sin/cos/exp as the fast forms of cdl_math.h; SPECTRAL_ON is the kernel record's `spectral` flag.
//   - Each scene's sections (its field and material code) become functions named s<i>_<name>, with SPECTRAL_ON
//     constant; the five functions the kernel calls in scene code (evalMaterial, sdUser, heightAt, densityOf,
//     customKernel) dispatch on the kernel record's `scene`.
//   - The glue: cdlLayout (the memory the host lays out), cdlInit (the GGX table), cdlSky (the sky table) and
//     cdlRenderSpan (one row of camera samples, Candela's 48-byte pixel output each).
// Memory: one kernel record K (its first fields fixed, see K_FIXED), a static frame record per function that needs
// one, struct records, and buffers. cdlLayout(out) describes them: the host allocates `arenaWords` words, writes
// each pointer and buffer capacity, and binds the scene's five row buffers into K's first five fields.
import { parse, walk } from './parse.mjs';
import { FunctionLowerer, LowerError } from './lower.mjs';
import { VECTORS, COMPONENTS, isVec, RESERVED, flit } from './values.mjs';

export const SKY_N = 64;
// K's fixed fields, in order (the host relies on these word offsets).
export const K_FIXED = [['bU', 'buffer'], ['bO', 'buffer'], ['bL', 'buffer'], ['bB', 'buffer'], ['bS', 'buffer'],
  ['etab', 'buffer'], ['sky', 'buffer'], ['scene', 'i32'], ['spectral', 'bool'], ['skyOn', 'bool'],
  ['r1', 'f32'], ['r2', 'f32'], ['r3', 'f32'], ['ri1', 'i32']];
export const ACCESSORS = { U: 'bU', objF: 'bO', litF: 'bL', bvhF: 'bB', sdF: 'bS' };
export const DISPATCH = [
  { name: 'evalMaterial', ret: 'Lobe', params: [['h', 'Hit'], ['wo', 'vec3f'], ['u', 'f32']] },
  { name: 'sdUser', ret: 'f32', params: [['k', 'i32'], ['p', 'vec3f']] },
  { name: 'heightAt', ret: 'f32', params: [['k', 'i32'], ['xz', 'vec2f']] },
  { name: 'densityOf', ret: 'f32', params: [['m', 'i32'], ['P', 'vec3f']] },
  { name: 'customKernel', ret: 'vec3f', params: [['ro', 'vec3f'], ['rd', 'vec3f']] },
];

// The CPU substitutions of the C++ kernel's gallery arm (cdl_overrides.inc), in WGSL. SKY and SKY_ON are the
// kernel record's sky table and flag; bitcast is the generator's own extension.
const PCG3D = `  var x: u32 = bitcast<u32>(p.x); var y: u32 = bitcast<u32>(p.y); var z: u32 = bitcast<u32>(p.z);
  x = x * 1664525u + 1013904223u; y = y * 1664525u + 1013904223u; z = z * 1664525u + 1013904223u;
  x += y * z; y += z * x; z += x * y;
  x ^= x >> 16u; y ^= y >> 16u; z ^= z >> 16u;
  x += y * z; y += z * x; z += x * y;`;
export const OVERRIDES_WGSL = `
fn hash3(p: vec3f) -> vec3f {
${PCG3D}
  let k: f32 = 2.0 / 16777216.0;
  return vec3f(f32(x >> 8u) * k - 1.0, f32(y >> 8u) * k - 1.0, f32(z >> 8u) * k - 1.0);
}
fn hash13(p: vec3f) -> f32 {
${PCG3D}
  return f32(x >> 8u) * (1.0 / 16777216.0);
}
fn skyTexel(x: i32, y: i32) -> vec3f { let t: i32 = 3 * (y * ${SKY_N} + x); return vec3f(SKY[t], SKY[t + 1], SKY[t + 2]); }
fn skyL(d: vec3f) -> vec3f {
  if (!SKY_ON) { return skyL_wgsl(d); }
  let inv: f32 = 1.0 / max(abs(d.x) + max(d.y, 0.0) + abs(d.z), 1e-20);
  let px: f32 = d.x * inv; let pz: f32 = d.z * inv; let h: f32 = 0.5 * f32(${SKY_N}); let top: f32 = f32(${SKY_N - 1});
  let fx: f32 = clamp((px + pz + 1.0) * h - 0.5, 0.0, top); let fy: f32 = clamp((px - pz + 1.0) * h - 0.5, 0.0, top);
  let x0: i32 = i32(fx); let y0: i32 = i32(fy); let x1: i32 = min(x0 + 1, ${SKY_N - 1}); let y1: i32 = min(y0 + 1, ${SKY_N - 1});
  let tx: f32 = fx - f32(x0); let ty: f32 = fy - f32(y0);
  var c: vec3f = mix(mix(skyTexel(x0, y0), skyTexel(x1, y0), tx), mix(skyTexel(x0, y1), skyTexel(x1, y1), tx), ty);
  if (d.y < 0.0) { c = c * vec3f(0.25, 0.23, 0.21) * exp(d.y * 3.0); }
  return c;
}
fn skyBuild() -> i32 {
  for (var j: i32 = 0; j < ${SKY_N}; j++) {
    for (var i: i32 = 0; i < ${SKY_N}; i++) {
      let u: f32 = (f32(i) + 0.5) * (2.0 / f32(${SKY_N})) - 1.0;
      let v: f32 = (f32(j) + 0.5) * (2.0 / f32(${SKY_N})) - 1.0;
      let px: f32 = 0.5 * (u + v); let pz: f32 = 0.5 * (u - v); let py: f32 = 1.0 - abs(px) - abs(pz);
      let c: vec3f = skyL_wgsl(normalize(vec3f(px, py, pz)));
      let t: i32 = 3 * (j * ${SKY_N} + i);
      SKY[t] = c.x; SKY[t + 1] = c.y; SKY[t + 2] = c.z;
    }
  }
  return 1;
}
`;
const VORONOI_REWRITE = ['fract(sin(cell.x * 7.1 + cell.y * 157.3 + cell.z * 113.7) * 43758.5453)', 'hash13(cell)'];

// The Typed helpers the lowering calls: cdl_math.h's forms with CDL_FAST_FLOOR, CDL_FAST_TRIG and CDL_FAST_EXP.
export const HELPERS = `function q_floor(x: f32): f32 {
    if (!(x > ${flit(-2.1e9)} && x < ${flit(2.1e9)})) { return x; }
    const t: f32 = f32(i32(x));
    if (t > x) { return t - 1.0; }
    return t;
}
function q_fract(x: f32): f32 {
    return x - q_floor(x);
}
function q_sin(a: f32): f32 {
    const k: f32 = q_floor(a * ${flit(0.15915494)} + 0.5);
    let x: f32 = a - k * ${flit(6.2831853)};
    if (x > ${flit(1.5707963)}) { x = ${flit(3.1415927)} - x; } else { if (x < ${flit(-1.5707963)}) { x = ${flit(-3.1415927)} - x; } }
    const x2: f32 = x * x;
    return x * (1.0 + x2 * (${flit(-0.16666667)} + x2 * (${flit(0.0083333310)} + x2 * (${flit(-0.00019840874)} + x2 * ${flit(2.7525562e-6)}))));
}
function q_cos(x: f32): f32 {
    return q_sin(x + ${flit(1.5707963)});
}
function q_exp(a: f32): f32 {
    if (a < -87.0) { return 0.0; }
    let x: f32 = a;
    if (x > 88.0) { x = 88.0; }
    const y: f32 = x * ${flit(1.4426950)};
    const n: f32 = q_floor(y);
    const t: f32 = y - n;
    const p: f32 = 1.0 + t * (${flit(0.69314718)} + t * (${flit(0.24022652)} + t * (${flit(0.055504109)} + t * (${flit(0.0096181291)} + t * ${flit(0.0013333558)}))));
    return p * Math.fromBits((i32(n) + 127) << 23);
}
function q_sign(a: f32): f32 {
    if (a > 0.0) { return 1.0; }
    if (a < 0.0) { return -1.0; }
    return 0.0;
}
function q_step(e: f32, x: f32): f32 {
    if (x >= e) { return 1.0; }
    return 0.0;
}
function q_smoothstep(e0: f32, e1: f32, x: f32): f32 {
    const t: f32 = Math.min(Math.max((x - e0) / (e1 - e0), 0.0), 1.0);
    return t * t * (3.0 - 2.0 * t);
}
function q_absi(a: i32): i32 {
    if (a < 0) { return -a; }
    return a;
}`;

const TYPED = { f32: 'f32', i32: 'i32', u32: 'i32', bool: 'bool' };
const callees = (node) => { const out = []; walk(node, n => { if (n.k === 'call') out.push(n.callee); }); return out; };

class Program {
  constructor(mathNames) {
    this.mathNames = mathNames;
    this.structs = new Map();
    this.consts = new Map();
    this.globals = new Map();
    this.kfields = [...K_FIXED];
    this.fns = new Map();          // typed name -> { name, ast, module, sig }
    this.modules = new Map();      // module key -> { prefix, spectral, names: Map wgsl -> typed }
    this.accessors = ACCESSORS;
    this.tables = { ETAB: { k: 'array', elem: 'f32', field: 'etab' }, SKY: { k: 'array', elem: 'f32', field: 'sky' } };
  }
  typedName(name) { return this.mathNames.has(name) || RESERVED.has(name) || name.startsWith('q_') ? 'k_' + name : name; }
  lookupModule(name, module) {
    if (name === 'SPECTRAL_ON') { const m = this.modules.get(module); return { k: 'spectral', value: m.spectral }; }
    if (name === 'SKY_ON') return { k: 'spectral', value: undefined, field: 'skyOn', sky: true };
    if (this.consts.has(name)) return { k: 'const', value: this.consts.get(name) };
    if (this.globals.has(name)) return this.globals.get(name);
    if (this.tables[name]) return this.tables[name];
    return null;
  }
  resolveFn(name, module) {
    const m = this.modules.get(module);
    const t = m.names.get(name) ?? this.modules.get('kernel').names.get(name);
    return t ? this.fns.get(t) : null;
  }
  hasEffects(node, module) {
    return callees(node).some(c => { const f = this.resolveFn(c, module); return f && f.sig.impure; });
  }

  addStructs(items) {
    for (const it of items.filter(i => i.k === 'struct')) {
      const members = it.members.map(m => {
        const base = RESERVED.has(m.name) ? m.name + '_' : m.name;
        const fields = isVec(m.type) ? COMPONENTS.slice(0, VECTORS[m.type][1]).split('').map(c => `${base}__${c}`) : [base];
        return { name: m.name, type: m.type, fields };
      });
      const flat = members.flatMap(m => m.fields.map(f => [f, isVec(m.type) ? VECTORS[m.type][0] : m.type]));
      this.structs.set(it.name, { name: it.name, members, flat });
    }
  }
  addModule(key, items, { prefix = '', spectral } = {}) {
    const names = new Map();
    this.modules.set(key, { prefix, spectral, names });
    for (const it of items) {
      if (it.k === 'fn') {
        const tname = prefix ? prefix + it.name : this.typedName(it.name);
        if (this.fns.has(tname)) throw new LowerError(`function ${tname} defined twice`);
        names.set(it.name, tname);
        this.fns.set(tname, { name: tname, ast: it, module: key, wgsl: it.name });
      } else if (it.k === 'const') {
        if (key !== 'kernel') throw new LowerError(`${key}: module constant ${it.name} in a scene`);
        this.consts.set(it.name, this.constValue(it));
      } else if (it.k === 'global') {
        if (key !== 'kernel') throw new LowerError(`${key}: module variable ${it.name} in a scene`);
        if (it.init.k === 'arrayLit') continue;    // the GGX table: K.etab, filled by cdlInit
        const b = { k: 'global', t: it.type, init: it.init };
        if (isVec(it.type)) { b.fields = COMPONENTS.slice(0, VECTORS[it.type][1]).split('').map(c => `${it.name}__${c}`); b.fields.forEach(f => this.kfields.push([f, TYPED[VECTORS[it.type][0]]])); }
        else { b.field = it.name; this.kfields.push([it.name, TYPED[it.type]]); }
        this.globals.set(it.name, b);
      } else if (it.k !== 'struct') throw new LowerError(`${key}: ${it.k} at module scope`);
    }
  }
  constValue(it) {
    const v = this.fold(it.init);
    if (it.type === 'f32') return { t: 'f32', e: flit(v) };
    if (it.type === 'i32') return { t: 'i32', e: String(v) };
    throw new LowerError('constant of type ' + it.type);
  }
  fold(e) {
    if (e.k === 'num') return parseFloat(e.v);
    if (e.k === 'un' && e.op === '-') return -this.fold(e.a);
    if (e.k === 'id' && this.consts.has(e.name)) return parseFloat(this.consts.get(e.name).e.replace(/[()]/g, ''));
    throw new LowerError('constant expression ' + e.k);
  }

  // Signatures: parameters by register class (ilp32f: eight x and eight f registers; the kernel record, the result
  // record and struct references are x), the rest through the callee's frame.
  signature(f, needsK) {
    const ast = f.ast;
    let x = (needsK ? 1 : 0) + (ast.ret && this.structs.has(ast.ret) ? 1 : 0), fl = 0, overflow = false;
    const params = ast.params.map(p => {
      const t = p.type;
      let n, cls;
      if (isVec(t)) { n = VECTORS[t][1]; cls = VECTORS[t][0] === 'f32' ? 'f' : 'x'; }
      else if (this.structs.has(t)) { n = 1; cls = 'x'; }
      else if (t in TYPED) { n = 1; cls = t === 'f32' ? 'f' : 'x'; }
      else throw new LowerError(`${f.name}: parameter type ${JSON.stringify(t)}`);
      const fits = cls === 'f' ? fl + n <= 8 : x + n <= 8;
      const base = RESERVED.has(p.name) ? p.name + '_' : p.name;
      const fields = isVec(t) ? COMPONENTS.slice(0, n).split('').map(c => `p_${base}__${c}`) : [`p_${base}`];
      if (fits) { if (cls === 'f') fl += n; else x += n; return { name: p.name, type: t, frame: false, fields }; }
      overflow = true;
      return { name: p.name, type: t, frame: true, fields };
    });
    return { params, ret: ast.ret, overflow, needsK };
  }
  // needsK (uses the kernel record), touchesState (reads or writes module variables, or dispatches to scene code),
  // impure (writes module variables): fixpoints over the call graph.
  analyse() {
    const own = new Map();
    for (const [name, f] of this.fns) {
      const o = { needsK: false, touches: false, writes: false, calls: new Set() };
      const isGlobal = (n) => this.globals.has(n);
      if (f.dispatch) { o.needsK = true; o.touches = true; for (const s of f.scenes) o.calls.add(s); }
      else {
        if (f.ast.ret && isVec(f.ast.ret)) o.needsK = true;
        if (f.forceK) o.needsK = true;
        walk(f.ast.body, n => {
          if (n.k === 'id') {
            if (isGlobal(n.name)) { o.needsK = true; o.touches = true; }
            if (this.tables[n.name] || n.name === 'SKY_ON' || (n.name === 'SPECTRAL_ON' && this.modules.get(f.module).spectral === undefined)) o.needsK = true;
          }
          if ((n.k === 'var' || n.k === 'let') && (this.structs.has(n.type) || typeof n.type === 'object')) o.needsK = true;
          if (n.k === 'assign') { let t = n.target; while (t.k === 'member' || t.k === 'index') t = t.obj; if (t.k === 'id' && isGlobal(t.name)) { o.writes = true; o.touches = true; o.needsK = true; } }
          if (n.k === 'call') {
            if (this.accessors[n.callee]) o.needsK = true;
            const c = this.resolveFn(n.callee, f.module);
            if (c) { o.calls.add(c.name); if (c.ast?.ret && (isVec(c.ast.ret) || this.structs.has(c.ast.ret))) o.needsK = true; if (c.dispatch) o.needsK = true; }
          }
        });
      }
      own.set(name, o);
    }
    for (let changed = true; changed;) {
      changed = false;
      for (const [name, o] of own) {
        for (const c of o.calls) {
          const q = own.get(c);
          if (q.needsK && !o.needsK && !this.fns.get(name).dispatch) { o.needsK = true; changed = true; }
          if (q.touches && !o.touches) { o.touches = true; changed = true; }
          if (q.writes && !o.writes) { o.writes = true; changed = true; }
        }
        if (!o.needsK) {
          const s = this.signature(this.fns.get(name), false);
          if (s.overflow) { o.needsK = true; changed = true; }
          else for (const c of o.calls) if (this.fns.get(c).sig0?.overflow) { o.needsK = true; changed = true; }
        }
        const f = this.fns.get(name);
        f.sig0 = this.signature(f, o.needsK);
      }
    }
    for (const [name, o] of own) {
      const f = this.fns.get(name);
      f.sig = { ...this.signature(f, o.needsK), touchesState: o.touches, impure: o.writes };
    }
  }
}

function recordText(name, fields) {
  return `record ${name} {\n${fields.map(([f, t]) => `    ${f}: ${t};`).join('\n')}\n}`;
}

// kernelWGSL: the fixed kernel (lib/candela.mjs fixedParts joined);
// scenes: [{ id, spectral, fieldCode, matCode }]; mathNames: the functions compiler/typed/lib/math.typed defines.
export function generateTypedProgram(kernelWGSL, scenes, mathNames) {
  const n1 = kernelWGSL.split(VORONOI_REWRITE[0]).length - 1;
  if (n1 !== 1) throw new LowerError(`voronoi3's cell hash occurs ${n1} times`);
  let src = kernelWGSL.replace(VORONOI_REWRITE[0], VORONOI_REWRITE[1]);
  const items = parse(src, 'kernel').filter(it => !(it.k === 'fn' && (it.name === 'hash3' || it.name === 'hash13')));
  const et = items.find(it => it.k === 'global' && it.name === 'ETAB');
  if (!et || et.init.k !== 'arrayLit' || et.init.args.length !== 256 || et.init.args.some(a => a.k !== 'num')) throw new LowerError('expected the GGX table ETAB of 256 numbers');
  const etab = et.init.args.map(a => parseFloat(a.v));
  const sky = items.find(it => it.k === 'fn' && it.name === 'skyL');
  if (!sky) throw new LowerError('the kernel has no skyL');
  sky.name = 'skyL_wgsl';
  items.push(...parse(OVERRIDES_WGSL, 'overrides'));
  const P = new Program(mathNames);
  P.addStructs(items);
  for (const d of DISPATCH) if (!P.structs.has(d.ret) && !(d.ret in TYPED) && !isVec(d.ret)) throw new LowerError('dispatch result ' + d.ret);
  P.addModule('kernel', items, { spectral: undefined });
  // the dispatchers, defined as kernel functions
  const kernelNames = P.modules.get('kernel').names;
  for (const d of DISPATCH) {
    if (kernelNames.has(d.name)) throw new LowerError(d.name + ' is defined in the fixed kernel');
    const ast = { k: 'fn', name: d.name, params: d.params.map(([name, type]) => ({ name, type })), ret: d.ret, body: [] };
    kernelNames.set(d.name, d.name);
    P.fns.set(d.name, { name: d.name, ast, module: 'kernel', dispatch: true, scenes: [] });
  }
  scenes.forEach((s, i) => {
    const sitems = parse(s.fieldCode + '\n' + s.matCode, s.id);
    P.addModule(s.id, sitems, { prefix: `s${i}_`, spectral: s.spectral });
    const names = P.modules.get(s.id).names;
    for (const d of DISPATCH) {
      const t = names.get(d.name);
      if (!t) throw new LowerError(`${s.id} does not define ${d.name}`);
      P.fns.get(t).forceK = true;
      P.fns.get(d.name).scenes.push(t);
    }
  });
  P.analyse();
  for (const d of DISPATCH) if (P.fns.get(d.name).sig.overflow) throw new LowerError(d.name + ' needs frame parameters');

  // lower every function
  const frames = new Map(), bodies = new Map();
  for (const [name, f] of P.fns) {
    if (f.dispatch) continue;
    const r = new FunctionLowerer(P, f).lower();
    bodies.set(name, r.text);
    if (r.frame.length) frames.set(name, { fields: r.frame, buffers: r.frameBuffers || new Map() });
  }
  // dispatchers: a binary tree over the scene index
  for (const d of DISPATCH) {
    const f = P.fns.get(d.name), sig = f.sig;
    const struct = P.structs.has(d.ret);
    const params = ['q_k: K', ...(struct ? [`q_ret: ${d.ret}`] : [])], args = ['q_k', ...(struct ? ['q_ret'] : [])];
    for (const p of sig.params) {
      if (P.structs.has(p.type)) { params.push(`${p.name}: ${p.type}`); args.push(p.name); }
      else if (isVec(p.type)) for (const c of COMPONENTS.slice(0, VECTORS[p.type][1])) { params.push(`${p.name}__${c}: ${TYPED[VECTORS[p.type][0]]}`); args.push(`${p.name}__${c}`); }
      else { params.push(`${p.name}: ${TYPED[p.type]}`); args.push(p.name); }
    }
    const result = struct ? 'i32' : TYPED[isVec(d.ret) ? VECTORS[d.ret][0] : d.ret];
    const leaf = (i) => [`return ${f.scenes[i]}(${args.join(', ')});`];
    const tree = (lo, hi) => {
      if (lo === hi) return leaf(lo);
      const mid = (lo + hi + 1) >> 1;
      return [`if (q_s < ${mid}) {`, ...tree(lo, mid - 1).map(l => '    ' + l), '} else {', ...tree(mid, hi).map(l => '    ' + l), '}'];
    };
    const body = f.scenes.length > 1 ? ['const q_s: i32 = q_k.scene;', ...tree(0, f.scenes.length - 1)] : (f.scenes.length ? leaf(0) : []);
    if (f.scenes.length !== 1) body.push(`return ${struct ? '0' : (result === 'f32' ? '0.0' : '0')};`);
    bodies.set(d.name, `function ${d.name}(${params.join(', ')}): ${result} {\n${body.map(l => '    ' + l).join('\n')}\n}`);
  }

  // renderPixel(px: vec2f, frameIx: u32) -> PixOut, called by the glue
  const rp = P.fns.get('renderPixel');
  if (!rp || rp.sig.ret !== 'PixOut' || !rp.sig.needsK || rp.sig.params.map(p => p.type).join() !== 'vec2f,u32') throw new LowerError('renderPixel has an unexpected signature');
  const pix = P.structs.get('PixOut').flat.map(f => f[0]);
  if (pix.length !== 12) throw new LowerError('PixOut is not 12 floats');
  P.kfields.push(['pix', 'PixOut']);
  const sb = P.fns.get('skyBuild');

  // records: structs, frames, K (each frame is a K field)
  const frameRecords = [];
  for (const [name, fr] of frames) { P.kfields.push([`f_${name}`, `F_${name}`]); frameRecords.push([`F_${name}`, fr.fields.map(([f, t]) => [f, t])]); }
  if (P.kfields.length > 512) throw new LowerError(`K has ${P.kfields.length} fields; the RV32 backend reaches 512`);
  for (const [, fields] of frameRecords) if (fields.length > 512) throw new LowerError('a frame has more than 512 fields');
  const types = [...[...P.structs.values()].map(s => recordText(s.name, s.flat.map(([f, t]) => [f, TYPED[t]]))),
    ...frameRecords.map(([n, f]) => recordText(n, f)), recordText('K', P.kfields)].join('\n');

  // the arena: K at word 0, then each frame, its struct records and buffers; pix and the two tables
  const words = (fields) => fields.length;
  let top = words(P.kfields);
  const ptrs = [], bufs = [];
  const kIndex = (f) => P.kfields.findIndex(([n]) => n === f);
  const alloc = (n) => { const at = top; top += n; return at; };
  const buffer = (fieldAt, units) => { const at = alloc(1 + Math.ceil(units / 2)); ptrs.push([fieldAt, at]); bufs.push([at, units]); };
  buffer(kIndex('etab'), 512);
  buffer(kIndex('sky'), 2 * 3 * SKY_N * SKY_N);
  ptrs.push([kIndex('pix'), alloc(P.structs.get('PixOut').flat.length)]);
  for (const [name, fr] of frames) {
    const base = alloc(fr.fields.length);
    ptrs.push([kIndex(`f_${name}`), base]);
    fr.fields.forEach(([field, type, kind], i) => {
      if (P.structs.has(type) && kind !== 'param') ptrs.push([base + i, alloc(P.structs.get(type).flat.length)]);
      else if (type === 'buffer') buffer(base + i, fr.buffers.get(field));
    });
  }
  // a frame parameter's field of struct type is a reference the caller writes: no record of its own
  const layout = { arenaWords: top, pointers: ptrs, buffers: bufs, kFields: P.kfields.map(f => f[0]) };
  const cells = [top & 0xffff, top >>> 16, ptrs.length, bufs.length, ...ptrs.flat(), ...bufs.flat()];
  for (const c of cells) if (c > 0xffff) throw new LowerError('layout cell over 16 bits');

  const glue = [
    `// cdlLayout(out): the arena the host lays out (cells: words low, words high, pointer count, buffer count, then`,
    `// [field word, target word] per pointer and [header word, capacity in UTF-16 units] per buffer); returns the cell count.`,
    `function cdlLayout(out: buffer): i32 {`,
    `    if (out.length < ${cells.length}) { return ${cells.length}; }`,
    ...cells.map((c, i) => `    out.setCharCodeAt(${i}, ${c});`),
    `    return ${cells.length};`, `}`,
    `// cdlInit(k): the GGX directional-albedo table (Candela's ggxTableWGSL(), as the C++ kernel's ETAB).`,
    `function cdlInit(q_k: K): i32 {`, `    const t = q_k.etab;`,
    ...etab.map((v, i) => `    t.setF32(${i}, ${flit(v)});`),
    `    return 1;`, `}`,
    `// cdlSky(k): the ${SKY_N} x ${SKY_N} sky table from the scene's sun and sky rows (cdl_overrides.inc cdl_sky_bind).`,
    `function cdlSky(q_k: K): i32 {`, `    return ${sb.name}(q_k);`, `}`,
    `// cdlRenderSpan(k, out, y, x0, x1, frame): one camera sample per pixel x0..x1-1 of row y, 12 floats each (cdl_pixout).`,
    `function cdlRenderSpan(q_k: K, out: buffer, y: i32, x0: i32, x1: i32, frame: i32): i32 {`,
    `    const o = q_k.pix;`, `    let at: i32 = 0;`,
    `    for (let x: i32 = x0; x < x1; x = x + 1) {`,
    `        renderPixel(q_k, o, f32(x), f32(y), frame);`,
    ...pix.map((f, i) => `        out.setF32(at + ${i}, o.${f});`),
    `        at = at + 12;`, `    }`, `    return 1;`, `}`,
  ].join('\n');

  const sceneNames = new Set(scenes.flatMap((s, i) => [...P.modules.get(s.id).names.values()]));
  const kernelText = [HELPERS, ...[...bodies].filter(([n]) => !sceneNames.has(n)).map(([, t]) => t)].join('\n');
  const scenesText = [...bodies].filter(([n]) => sceneNames.has(n)).map(([, t]) => t).join('\n');
  const stats = { functions: bodies.size, frames: frames.size, kFields: P.kfields.length, arenaWords: top,
    structs: [...P.structs.keys()], needsK: [...P.fns.values()].filter(f => f.sig.needsK).length };
  return { types, kernel: kernelText, scenes: scenesText, glue, layout, stats };
}
