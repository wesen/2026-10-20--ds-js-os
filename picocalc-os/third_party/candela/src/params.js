// params.js — named knobs: typed, unit-aware DAG leaves. A dynamic param is a uniform (moving it costs a
// buffer write); a static one is a specialisation constant (moving it re-runs the build and swaps the kernel).
import { CandelaError, didYouMean, BENIGN, callSite } from './diag.js';
import { PARAM, node, constNode, setParamResolver, E, parseColor } from './fx.js';
import { Quantity, isQ, u, fmtNum } from './units.js';

// values outlive builds: the scene file re-runs, the sliders keep their places
export const store = {
  values: new Map(), defs: new Map(), order: [], listeners: new Set(), version: 0,
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  emit(p) { this.version++; for (const f of this.listeners) { try { f(p); } catch (e) { console.error(e); } } },
  beginBuild() { this.defs = new Map(); this.order = []; },
  reset(name) { if (name) this.values.delete(name); else this.values.clear(); },
};

const KINDS = {
  float: { type: 'f', unit: '', min: 0, max: 1 },
  int: { type: 'f', unit: '', min: 0, max: 10, step: 1, int: true },
  bool: { type: 'b', unit: '' },
  color: { type: 'v3', unit: '' },
  angle: { type: 'f', unit: '°', min: 0, max: Math.PI, dim: 'angle', disp: v => v * 180 / Math.PI, undisp: v => v * Math.PI / 180, q: v => u.rad(v) },
  length: { type: 'f', unit: 'm', min: 0, max: 10, dim: 'length' },
  lumen: { type: 'f', unit: 'lm', min: 0, max: 5000, dim: 'flux' },
  lux: { type: 'f', unit: 'lx', min: 0, max: 120000, dim: 'illuminance' },
  nit: { type: 'f', unit: 'nit', min: 0, max: 10000, dim: 'luminance' },
  kelvin: { type: 'f', unit: 'K', min: 1000, max: 12000, dim: 'temperature' },
  ev: { type: 'f', unit: 'EV', min: -4, max: 20 },
  choice: { type: 'choice', unit: '' },
};
const CONFIG = ['range', 'step', 'label', 'unit', 'scale', 'static', 'role', 'about', 'group', 'id'];

function normValue(kind, v) {
  if (kind === 'color') { if (typeof v === 'string') { const c = parseColor(v); if (!c) throw new CandelaError('E121', `'${v}' is not a colour`); return c; } if (typeof v === 'number') return [v, v, v]; if (Array.isArray(v) && v.length === 3) return v.map(Number); throw new CandelaError('E121', 'a colour param takes "#rrggbb", a grey number or [r, g, b]'); }
  if (kind === 'bool') return !!v;
  if (kind === 'choice') return String(v);
  if (isQ(v)) return v.v;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new CandelaError('E121', `param.${kind}(…) takes a number${KINDS[kind].dim ? ' or a quantity' : ''}`);
  return v;
}

class ParamDef {
  constructor(kind, def, cfg = {}) {
    this.kind = kind; this.k = KINDS[kind]; this.def = def; this.cfg = cfg;
  }
  with(k, v) { const d = new ParamDef(this.kind, this.def, Object.assign({}, this.cfg, { [k]: v })); if (this.options) d.options = this.options; return d; }
}
// the handle a scene uses: a field, a slider, a value
function handleOf(def, name) {
  const k = def.k, cfg = def.cfg, kind = def.kind;
  const id = cfg.id || name;
  const st = () => store.values.has(id) ? store.values.get(id) : def.def;
  const lo = cfg.range ? cfg.range[0] : k.min, hi = cfg.range ? cfg.range[1] : k.max;
  const H = {
    [PARAM]: true, derived: false, id, name, kind, type: k.type, unit: cfg.unit != null ? cfg.unit : k.unit, label: cfg.label || name, about: cfg.about || '', group: cfg.group || null,
    min: lo, max: hi, step: cfg.step != null ? cfg.step : k.step || null, scale: cfg.scale || 'linear', isStatic: !!cfg.static || kind === 'choice', options: def.options || null,
    default: def.def, role: cfg.role || null, int: !!k.int,
    disp: k.disp || (v => v), undisp: k.undisp || (v => v),
    get value() { return st(); },
    get quantity() { const v = st(); return k.q ? k.q(v) : k.dim ? new Quantity(v, k.dim, H.unit) : v; },
    set(v) {
      if (typeof v === 'string' && kind !== 'color' && kind !== 'choice') { const n = parseFloat(v); if (!Number.isFinite(n)) throw new CandelaError('E121', `${id}: not a number '${v}'`); v = /deg|°/.test(v) && kind === 'angle' ? n * Math.PI / 180 : n; }
      let x = normValue(kind, v);
      if (kind === 'choice' && def.options && !def.options.includes(x)) throw new CandelaError('E121', `${id}: '${x}' is not one of ${def.options.join(', ')}`, { suggest: didYouMean(x, def.options) });
      if (typeof x === 'number' && lo != null && hi != null && (x < lo - 1e-9 || x > hi + 1e-9)) x = Math.max(lo, Math.min(hi, x));
      if (H.int && typeof x === 'number') x = Math.round(x);
      store.values.set(id, x); store.emit(H); return x;
    },
    reset() { store.values.delete(id); store.emit(H); },
    isChanged() { const v = st(), d = def.def; return Array.isArray(v) ? v.some((c, i) => Math.abs(c - d[i]) > 1e-9) : v !== d; },
    display() { const v = st(); return kind === 'color' ? '#' + v.map(c => Math.round(Math.max(0, Math.min(1, c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)) * 255).toString(16).padStart(2, '0')).join('') : kind === 'bool' ? String(v) : kind === 'choice' ? v : fmtNum(+H.disp(v).toFixed(4)) + (H.unit ? ' ' + H.unit : ''); },
    // a host-side function of this param: re-run on the CPU when the param moves
    map(fn) { return derived(H, fn); },
    select(a, b) {
      if (H.isStatic) return st() ? a : b;
      return E(node('select', typeOf(a, b), [node('param', 'b', [], { id }), liftAny(a), liftAny(b)]));
    },
    pick(obj) {
      if (!H.isStatic) throw new CandelaError('E124', `${id}.pick({…}) needs a static param (a choice, or .static())`);
      const v = st(); if (!(v in obj)) throw new CandelaError('E121', `${id}.pick: no entry for '${v}'`, { suggest: didYouMean(String(v), Object.keys(obj)) });
      return obj[v];
    },
    // a build lambda keyed on a static param: it runs now with the current value; moving the param re-runs the build
    build(fn) { if (!H.isStatic) throw new CandelaError('E124', `${id}.build(fn) needs a static param`); return fn(st()); },
    toString() { return `param ${id} = ${H.display()}`; },
    toJSON() { return { param: id, value: st() }; },
  };
  return guard(H, `param ${id}`);
}
const typeOf = (a, b) => { const t = [a, b].map(x => typeof x === 'number' ? 'f' : Array.isArray(x) ? 'v' + x.length : typeof x === 'string' ? 'v3' : x && x.type ? x.type : 'f'); return t[0] === 'f' ? t[1] : t[0]; };
let liftAny = null; export const setLift = f => { liftAny = f; };

let DN = 0;
function derived(src, fn) {
  const id = `${src.id}→${(fn.name && fn.name !== 'anonymous' && fn.name !== 'fn') ? fn.name : 'map' + (++DN)}`;
  const first = fn(src.quantity);
  const type = Array.isArray(first) ? 'v' + first.length : typeof first === 'boolean' ? 'b' : 'f';
  const H = {
    [PARAM]: true, id, derived: true, src, fn, type, kind: 'derived', isStatic: src.isStatic,
    get value() { const v = fn(src.quantity); return isQ(v) ? v.v : v; },
    get quantity() { return fn(src.quantity); },
    map(f2) { return derived(H, f2); },
    toString() { return `derived ${id}`; }, toJSON() { return { derived: id }; },
  };
  return guard(H, `derived param ${id}`);
}
function guard(H, what) {
  return new Proxy(H, {
    get(t, k, recv) {
      if (k in t) return t[k];
      if (typeof k === 'string' && FIELD_METHODS.has(k)) { if (t.derived) registerParam(recv); const f = E(resolveParam(recv)); return typeof f[k] === 'function' ? (...a) => f[k](...a) : f[k]; }
      if (k === Symbol.toPrimitive) return () => { throw new CandelaError('E203', `${what} used in build-time JS arithmetic: its value can change after the scene is built`, { loc: callSite(), hint: [`→ ${H.id}.map(v => …)   a host function, re-run when the param moves`, '→ pass the param itself where a value is wanted: .roughness(P.gloss)'] }); };
      if (typeof k === 'symbol' || BENIGN.has(k)) return undefined;
      throw new CandelaError('E104', `'${k}' is not a member of ${what}`, { suggest: didYouMean(k, Object.keys(t)) });
    },
    set(t, k, v) { if (k === 'value') { t.set(v); return true; } throw new CandelaError('E105', `${what} is read-only; use .set(v)`); },
  });
}

// how a param becomes a node: static → a constant now; dynamic → a uniform slot
const resolveParam = p => {
  if (p.isStatic && !p.derived) { const v = p.value; return typeof v === 'boolean' ? constNode(v) : typeof v === 'string' ? constNode(0) : constNode(v); }
  if (p.derived && p.isStatic) return constNode(p.value);
  return node('param', p.type === 'b' ? 'b' : p.type, [], { id: p.id, derived: !!p.derived });
};
setParamResolver(resolveParam);
// field arithmetic straight on a param: P.gloss.mul(2) is fx.float(P.gloss).mul(2) — a uniform in the kernel
const FIELD_METHODS = new Set(['add', 'sub', 'mul', 'div', 'neg', 'abs', 'floor', 'ceil', 'fract', 'mod', 'sin', 'cos', 'pow', 'sqrt', 'exp', 'clamp', 'sat', 'oneMinus', 'mix', 'smoothstep', 'step', 'remap', 'gt', 'lt', 'gte', 'lte', 'between', 'dot', 'cross', 'length', 'normalize', 'luminance', 'x', 'y', 'z', 'r', 'g', 'b', 'xyz', 'rgb']);
export const derivedRegistry = new Map();   // id → handle, for uniforms
export function registerParam(h) { if (h.derived) derivedRegistry.set(h.id, h); }

// ---------- the public API ----------
function mkParam(kind) {
  return (def, o) => {
    if (kind === 'choice') {
      if (!Array.isArray(def) || !def.length) throw new CandelaError('E121', "param.choice(['a', 'b', …], default?) takes a list");
      const d = new ParamDef('choice', o != null ? String(o) : String(def[0]), { static: true }); d.options = def.map(String); return chain(d);
    }
    if (def == null) def = kind === 'bool' ? false : kind === 'color' ? [0.8, 0.8, 0.8] : kind === 'kelvin' ? 6500 : kind === 'ev' ? 12 : 0;
    if (KINDS[kind].dim && isQ(def) && def.dim !== KINDS[kind].dim) throw new CandelaError('E120', `param.${kind} expects ${KINDS[kind].dim}; got ${def}`);
    return chain(new ParamDef(kind, normValue(kind, def)));
  };
}
function chain(d) {
  const api = {
    __def: d,
    range: (a, b) => chain(d.with('range', [normValue(d.kind === 'color' ? 'float' : d.kind, a), normValue(d.kind === 'color' ? 'float' : d.kind, b)])),
    step: s => chain(d.with('step', isQ(s) ? s.v : s)), label: s => chain(d.with('label', s)), unit: s => chain(d.with('unit', s)), scale: s => chain(d.with('scale', s)),
    static: () => chain(d.with('static', true)), role: r => chain(d.with('role', r)), about: s => chain(d.with('about', s)), group: g => chain(d.with('group', g)), id: s => chain(d.with('id', s)),
  };
  if (d.options) { const nd = d; api.__def = nd; }
  return new Proxy(api, { get(t, k) { if (k in t) return t[k]; if (typeof k === 'symbol' || BENIGN.has(k)) return undefined; if (k === Symbol.toPrimitive) return () => { throw new CandelaError('E203', 'a param definition used in arithmetic'); }; throw new CandelaError('E104', `'${k}' is not a param option`, { suggest: didYouMean(String(k), CONFIG) }); } });
}
export const param = Object.fromEntries(Object.keys(KINDS).map(k => [k, mkParam(k)]));
param.lift = v => v && v[PARAM] ? v : guard({ [PARAM]: true, id: 'const', type: 'f', isStatic: true, get value() { return isQ(v) ? v.v : v; }, get quantity() { return v; }, map(fn) { const r = fn(v); return param.lift(r); } }, 'constant');
export const lift = param.lift;

// params({ name: param.float(…), … }) → handles keyed by name
export function params(spec) {
  if (!spec || typeof spec !== 'object') throw new CandelaError('E121', 'params({ name: param.float(0.5), … })');
  const out = {};
  for (const [name, d] of Object.entries(spec)) {
    const def = d && d.__def; if (!def) throw new CandelaError('E121', `params: '${name}' is not a param definition (use param.float(…), param.color(…), …)`);
    const h = handleOf(def, name);
    if (store.defs.has(h.id) && store.defs.get(h.id) !== h) { /* redefined in this build: the later one wins */ }
    store.defs.set(h.id, h); if (!store.order.includes(h.id)) store.order.push(h.id);
    // a stored value that no longer fits the param's kind is dropped
    if (store.values.has(h.id)) { const v = store.values.get(h.id); if ((Array.isArray(v) !== Array.isArray(h.default)) || typeof v !== typeof h.default || (h.options && !h.options.includes(v))) store.values.delete(h.id); }
    out[name] = h;
  }
  return Object.freeze(out);
}
export const isParam = x => !!(x && x[PARAM]);
export function paramValue(id) {
  const h = store.defs.get(id); if (h) return h.value;
  const d = derivedRegistry.get(id); if (d) return d.value;
  return 0;
}
