// fx.js — fields: typed, hash-consed expression DAGs, built by tracing JS lambdas with symbolic proxies.
// One DAG, four evaluations: WGSL code (GLSL via translation), JS on the CPU, interval bounds, and printing.
import { CandelaError, didYouMean, BENIGN, callSite, lineText, report } from './diag.js';
import { isQ, Quantity } from './units.js';

// ---------- nodes ----------
let NID = 0;
const TABLE = new Map();
export class Node {
  constructor(op, type, args, x) { this.op = op; this.type = type; this.args = args; this.x = x; this.id = 0; }
}
export function node(op, type, args = [], x = null) {
  const key = op + '|' + type + '|' + (x == null ? '' : JSON.stringify(x)) + '|' + args.map(a => a.id).join(',');
  let n = TABLE.get(key);
  if (n) return n;
  n = new Node(op, type, args, x); n.id = ++NID; n.key = key; TABLE.set(key, n);
  if (TABLE.size > 400000) TABLE.clear();
  return n;
}
let RNDN = 0;
export const freshTag = () => ++RNDN;

const SIZE = { f: 1, b: 1, v2: 2, v3: 3, v4: 4 };
export const WT = { f: 'f32', b: 'bool', v2: 'vec2f', v3: 'vec3f', v4: 'vec4f' };
const vecOf = n => n === 1 ? 'f' : 'v' + n;
export const isVec = t => t === 'v2' || t === 'v3' || t === 'v4';

// ---------- the symbolic proxy ----------
const EXPR = Symbol.for('candela.expr');
export const nodeOf = x => (x && (typeof x === 'object' || typeof x === 'function') && x[EXPR]) || null;
export const isExpr = x => !!nodeOf(x);

function stageError(n) {
  const loc = callSite();
  const src = lineText(loc), col = loc ? loc.col - 1 : 0;
  const near = src.slice(Math.max(0, col - 2), col + 40);
  const cmp = /^[^;]*?(\s(>=?|<=?|===?|!==?)\s|\?)/.test(near) || /\b(if|while)\s*\(/.test(src);
  if (cmp) throw new CandelaError('E202', `cannot branch on a symbolic ${tname(n.type)} with \`?:\`, \`if\` or a comparison`, { loc, hint: ['→ fx.select(a.gt(b), x, y)            hard edge', '→ fx.mix(y, x, a.smoothstep(lo, hi))   anti-aliased'] });
  throw new CandelaError('E201', `symbolic ${tname(n.type)} used as a JS number: this value exists only when the shader runs, but JS arithmetic happens now, at trace time`, { loc, hint: ['→ use methods: a.mul(10).sin()   or fx functions: fx.sin(a), fx.max(a, b)', '  (Math.* and + - * / on fields are compile-time JS)'] });
}
const tname = t => ({ f: 'Float', b: 'Bool', v2: 'Vec2', v3: 'Vec3', v4: 'Vec4' }[t] || t);

const handler = {
  get(t, k) {
    const n = t[EXPR];
    if (k === EXPR) return n;
    if (k === Symbol.toPrimitive) return () => stageError(n);
    if (typeof k === 'symbol') return undefined;
    if (k === 'node') return n;
    if (k === 'type') return n.type;
    if (k === 'kind') return 'field';
    if (Object.prototype.hasOwnProperty.call(METHODS, k)) return (...a) => E(METHODS[k](n, ...a));
    if (/^[xyzw]{1,4}$/.test(k) || /^[rgba]{1,4}$/.test(k)) return E(swizzle(n, k));
    if (k === 'toString') return () => `fx.${tname(n.type)}#${n.id}`;
    if (k === 'toJSON') return () => `fx.${tname(n.type)}(${printNode(n, 2)})`;
    if (k === 'valueOf') return () => stageError(n);
    if (k === 'then' || BENIGN.has(k)) return undefined;
    throw new CandelaError('E104', `'${k}' is not a method of a ${tname(n.type)} field`, { suggest: didYouMean(k, Object.keys(METHODS)), hint: 'fields have methods (add, mul, mix, smoothstep, sin, …) and swizzles (.x, .xz, .rgb)' });
  },
  has(t, k) { return k === EXPR || Object.prototype.hasOwnProperty.call(METHODS, k); },
  ownKeys() { return []; },
  getOwnPropertyDescriptor() { return undefined; },
  set(t, k) { throw new CandelaError('E105', `fields are immutable values: cannot set '${String(k)}'`, { hint: 'make a new field: const b = a.mul(2)' }); },
};
export function E(n) { const t = {}; t[EXPR] = n; return new Proxy(t, handler); }

// ---------- lifting JS values to nodes ----------
const NAMED = { white: [1, 1, 1], black: [0, 0, 0], grey: [0.18, 0.18, 0.18], gray: [0.18, 0.18, 0.18], red: [0.8, 0.04, 0.04], green: [0.05, 0.6, 0.08], blue: [0.03, 0.08, 0.75] };
export const srgbToLinear = c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
export const linearToSrgb = c => c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
export function parseColor(s) {
  if (typeof s !== 'string') return null;
  const t = s.trim().toLowerCase();
  if (NAMED[t]) return NAMED[t].slice();
  let m = t.match(/^#([0-9a-f]{6})$/); if (m) { const v = parseInt(m[1], 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255].map(x => srgbToLinear(x / 255)); }
  m = t.match(/^#([0-9a-f]{3})$/); if (m) return m[1].split('').map(h => srgbToLinear(parseInt(h + h, 16) / 255));
  return null;
}
export const PARAM = Symbol.for('candela.param');
let paramResolver = null;              // set by params.js: (param) => node (uniform or constant for static)
export const setParamResolver = f => { paramResolver = f; };
let tracer = null;                     // set while tracing a lambda: () => context proxy
export const constNode = v => typeof v === 'number' ? node('const', 'f', [], v) : typeof v === 'boolean' ? node('const', 'b', [], v) : node('const', vecOf(v.length), [], v.slice());

export function lift(v, want) {
  const n = nodeOf(v); if (n) return n;
  if (v && v[PARAM]) return paramResolver(v);
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw new CandelaError('E121', `field constant must be finite, got ${v}`); return want && isVec(want) ? constNode(new Array(SIZE[want]).fill(v)) : constNode(v); }
  if (typeof v === 'boolean') return constNode(v);
  if (isQ(v)) return constNode(v.v);
  if (typeof v === 'string') { const c = parseColor(v); if (!c) throw new CandelaError('E121', `'${v}' is not a colour: use '#rrggbb', a number (grey), or [r, g, b] (linear)`); return constNode(c); }
  if (Array.isArray(v)) {
    if (v.length < 2 || v.length > 4) throw new CandelaError('E121', `a vector has 2 to 4 components, got ${v.length}`);
    if (v.every(x => typeof x === 'number' || isQ(x))) return constNode(v.map(x => +x));
    return node('vec', vecOf(v.length), v.map(x => { const k = lift(x); if (k.type !== 'f') throw new CandelaError('E121', 'vector components must be scalars'); return k; }));
  }
  if (typeof v === 'function') return traceLambda(v);
  throw new CandelaError('E121', `cannot use ${v === null ? 'null' : typeof v} as a field value`);
}
export const liftE = (v, want) => E(lift(v, want));

// ---------- tracing ----------
// a lambda given where a field is expected is called once with a symbolic context
export function traceLambda(fn, ctx) {
  const c = ctx || (tracer ? tracer() : surfaceContext());
  const r = fn(c);
  if (r === undefined) throw new CandelaError('E206', 'the pattern lambda returned nothing: return a field (p => p.uv.x.mul(8).floor())');
  return lift(r);
}
const CTX_FIELDS = {
  P: ['v3', 'world-space position'], N: ['v3', 'shading normal'], Ng: ['v3', 'geometric normal'], uv: ['v2', 'surface parameterisation'],
  wo: ['v3', 'direction toward the viewer'], time: ['f', 'seconds'], lambda: ['f', 'wavelength in nm (spectral engine; 550 otherwise)'],
  local: ['v3', 'object-space position'], curvature: ['f', 'mean curvature (approx.)'],
};
function contextProxy(allowed, label) {
  const inst = new Proxy({}, { get(_, k) { if (k === 'random') return E(node('ctx', 'f', [], 'irand')); if (k === 'id') return E(node('ctx', 'f', [], 'iid')); if (typeof k === 'symbol' || BENIGN.has(k)) return undefined; throw new CandelaError('E104', `'instance.${String(k)}' does not exist`, { suggest: didYouMean(String(k), ['random', 'id']) }); } });
  return new Proxy({}, {
    get(_, k) {
      if (typeof k === 'symbol') return undefined;
      if (k === 'instance') return inst;
      if (CTX_FIELDS[k]) {
        if (allowed && !allowed.includes(k)) throw new CandelaError('E207', `p.${k} is not available in ${label}; available: ${allowed.map(a => 'p.' + a).join(', ')}`);
        return E(node('ctx', CTX_FIELDS[k][0], [], k));
      }
      if (k === 'then' || BENIGN.has(k)) return undefined;
      throw new CandelaError('E104', `'p.${k}' is not part of the shading context`, { suggest: didYouMean(k, Object.keys(CTX_FIELDS).concat(['instance'])), hint: 'p.P p.N p.Ng p.uv p.wo p.time p.lambda p.local p.instance.random' });
    },
  });
}
export const surfaceContext = () => contextProxy(null, 'a surface');
export const pointContext = (label) => contextProxy(['P', 'time', 'local'], label);
export function withTracer(make, fn) { const prev = tracer; tracer = make; try { return fn(); } finally { tracer = prev; } }

// ---------- operations ----------
const bcast = (a, b) => { if (a === b) return a; if (a === 'f') return b; if (b === 'f') return a; return null; };
function arith(op) {
  return (n, o) => {
    const b = lift(o, n.type); const t = bcast(n.type, b.type);
    if (!t || n.type === 'b' || b.type === 'b') throw new CandelaError('E122', `cannot ${op} ${tname(n.type)} and ${tname(b.type)}`, { hint: 'swizzle to match: v.xy, or splat a scalar' });
    return node(op, t, [n, b]);
  };
}
const un = op => n => { if (n.type === 'b') throw new CandelaError('E122', `${op} of a Bool`); return node(op, n.type, [n]); };
const fn2 = op => (n, o) => { const b = lift(o, n.type); const t = bcast(n.type, b.type); if (!t) throw new CandelaError('E122', `${op}(${tname(n.type)}, ${tname(b.type)})`); return node(op, t, [n, b]); };
const cmp = op => (n, o) => { const b = lift(o); if (n.type !== 'f' || b.type !== 'f') throw new CandelaError('E122', `comparisons are on scalars: ${tname(n.type)} ${op} ${tname(b.type)}`, { hint: 'compare a component: v.x.gt(0.5)' }); return node(op, 'b', [n, b]); };
const scalarOf = (n, what) => { if (!isVec(n.type)) throw new CandelaError('E122', `${what} needs a vector, got ${tname(n.type)}`); };

export function swizzle(n, k) {
  const map = { x: 0, y: 1, z: 2, w: 3, r: 0, g: 1, b: 2, a: 3 };
  const s = SIZE[n.type];
  if (n.type === 'b') throw new CandelaError('E122', `.${k} on a Bool`);
  const idx = [...k].map(c => map[c]);
  if (idx.some(i => i >= s)) throw new CandelaError('E122', `.${k} on a ${tname(n.type)}`, { hint: `a ${tname(n.type)} has ${'xyzw'.slice(0, s).split('').join(', ')}` });
  if (n.type === 'f') return node('splat', vecOf(k.length), [n]);
  const sw = idx.map(i => 'xyzw'[i]).join('');
  if (sw === 'xyzw'.slice(0, s) && k.length === s) return n;
  return node('swz', vecOf(k.length), [n], sw);
}

export const METHODS = {
  add: arith('add'), sub: arith('sub'), mul: arith('mul'), div: arith('div'),
  neg: un('neg'), abs: un('abs'), floor: un('floor'), ceil: un('ceil'), fract: un('fract'), sign: un('sign'),
  sin: un('sin'), cos: un('cos'), tan: un('tan'), asin: un('asin'), acos: un('acos'), atan: un('atan'), exp: un('exp'), exp2: un('exp2'),
  log: un('log'), log2: un('log2'), sqrt: un('sqrt'),
  mod: fn2('mod'), pow: fn2('pow'), min: fn2('min'), max: fn2('max'), atan2: fn2('atan2'),
  clamp: (n, lo = 0, hi = 1) => { const a = lift(lo, n.type), b = lift(hi, n.type); return node('clamp', n.type, [n, a, b]); },
  sat: n => node('clamp', n.type, [n, lift(0, n.type), lift(1, n.type)]),
  saturate: n => node('clamp', n.type, [n, lift(0, n.type), lift(1, n.type)]),
  oneMinus: n => node('sub', n.type, [lift(1, n.type), n]),
  // t.mix(a, b): this is the blend factor
  mix: (n, a, b) => mixNodes(lift(a), lift(b), n),
  lerp: (n, a, b) => mixNodes(lift(a), lift(b), n),
  smoothstep: (n, e0, e1) => node('smoothstep', n.type, [lift(e0, n.type), lift(e1, n.type), n]),
  step: (n, edge) => node('step', n.type, [lift(edge, n.type), n]),
  remap: (n, a, b, c, d) => { const t = node('div', n.type, [node('sub', n.type, [n, lift(a, n.type)]), lift(+b - +a || 1, n.type)]); const lo = lift(c), hi = lift(d); const tt = bcast(lo.type, hi.type) || lo.type; return mixNodes(lo, hi, t, tt); },
  dot: (n, o) => { const b = lift(o); scalarOf(n, 'dot'); if (b.type !== n.type) throw new CandelaError('E122', `dot(${tname(n.type)}, ${tname(b.type)})`); return node('dot', 'f', [n, b]); },
  cross: (n, o) => { const b = lift(o); if (n.type !== 'v3' || b.type !== 'v3') throw new CandelaError('E122', 'cross needs two Vec3'); return node('cross', 'v3', [n, b]); },
  length: n => { scalarOf(n, 'length'); return node('length', 'f', [n]); },
  normalize: n => { scalarOf(n, 'normalize'); return node('normalize', n.type, [n]); },
  distance: (n, o) => node('length', 'f', [arith('sub')(n, o)]),
  reflect: (n, o) => node('reflect', n.type, [n, lift(o)]),
  gt: cmp('gt'), lt: cmp('lt'), gte: cmp('gte'), lte: cmp('lte'), eq: cmp('eq'), ne: cmp('ne'),
  and: (n, o) => node('and', 'b', [n, lift(o)]), or: (n, o) => node('or', 'b', [n, lift(o)]), not: n => node('not', 'b', [n]),
  between: (n, lo, hi) => node('and', 'b', [cmp('gte')(n, lo), cmp('lte')(n, hi)]),
  select: (n, a, b) => { if (n.type !== 'b') throw new CandelaError('E122', `.select(a, b) is for a Bool; got ${tname(n.type)}`, { hint: 'make one: x.gt(0.5).select(a, b)' }); return selectNodes(n, lift(a), lift(b)); },
  luminance: n => { if (n.type !== 'v3') throw new CandelaError('E122', 'luminance of a non-colour'); return node('dot', 'f', [n, constNode([0.2126, 0.7152, 0.0722])]); },
  maxComponent: n => { scalarOf(n, 'maxComponent'); return node('maxc', 'f', [n]); },
  at: n => n,
};
export function mixNodes(a, b, t, forceT) {
  const ty = forceT || bcast(a.type, b.type);
  if (!ty) throw new CandelaError('E122', `mix(${tname(a.type)}, ${tname(b.type)}, …)`);
  if (t.type !== 'f' && t.type !== ty) throw new CandelaError('E122', `mix factor must be a Float or a ${tname(ty)}`);
  return node('mix', ty, [a, b, t]);
}
export function selectNodes(c, a, b) {
  const ty = bcast(a.type, b.type); if (!ty) throw new CandelaError('E122', `select(${tname(a.type)}, ${tname(b.type)})`);
  return node('select', ty, [c, a, b]);
}

// ---------- the fx namespace ----------
const L = liftE;
const scalarFn = op => (x, ...r) => E(METHODS[op](lift(x), ...r));
export const fx = {
  float: x => E(lift(x, 'f')), vec2: (x, y) => E(lift([x, y ?? x])), vec3: (x, y, z) => E(lift(y == null ? [x, x, x] : [x, y, z])), vec4: (x, y, z, w) => E(lift([x, y, z, w])),
  color: (r, g, b) => {
    if (typeof r === 'number' && g == null) return E(constNode([r, r, r]));
    if (g != null) return E(lift([r, g, b]));
    const n = lift(r); if (n.type === 'f') return E(node('splat', 'v3', [n])); return E(n);
  },
  mix: (a, b, t) => E(mixNodes(lift(a), lift(b), lift(t))),
  select: (c, a, b) => { const cn = lift(c); if (cn.type !== 'b') throw new CandelaError('E122', 'fx.select(cond, a, b): cond must be a Bool (use .gt/.lt)'); return E(selectNodes(cn, lift(a), lift(b))); },
  smoothstep: (e0, e1, x) => { const n = lift(x); return E(node('smoothstep', n.type, [lift(e0, n.type), lift(e1, n.type), n])); },
  step: (e, x) => { const n = lift(x); return E(node('step', n.type, [lift(e, n.type), n])); },
  min: (a, b) => E(METHODS.min(lift(a), b)), max: (a, b) => E(METHODS.max(lift(a), b)), clamp: (x, lo, hi) => E(METHODS.clamp(lift(x), lo, hi)),
  abs: scalarFn('abs'), sin: scalarFn('sin'), cos: scalarFn('cos'), floor: scalarFn('floor'), fract: scalarFn('fract'), sqrt: scalarFn('sqrt'),
  exp: scalarFn('exp'), log: scalarFn('log'), log2: scalarFn('log2'), pow: (a, b) => E(METHODS.pow(lift(a), b)),
  length: scalarFn('length'), normalize: scalarFn('normalize'), dot: (a, b) => E(METHODS.dot(lift(a), b)), cross: (a, b) => E(METHODS.cross(lift(a), b)),
  luminance: c => E(METHODS.luminance(lift(c))),
  time: () => E(node('ctx', 'f', [], 'time')),
  hash: v => { const n = lift(v); return E(node('hash', 'f', [n.type === 'f' ? node('splat', 'v3', [n]) : n.type === 'v2' ? node('vec', 'v3', [node('swz', 'f', [n], 'x'), node('swz', 'f', [n], 'y'), constNode(0)]) : n])); },
  remap: (x, a, b, c, d) => E(METHODS.remap(lift(x), a, b, c, d)),
  checker: (uv, n = 8) => { const u = lift(uv); const s = node('mul', u.type, [u, lift(n)]); const f = node('floor', u.type, [s]); const sum = node('add', 'f', [node('swz', 'f', [f], 'x'), node('swz', 'f', [f], 'y')]); return E(node('mod', 'f', [sum, constNode(2)])); },
  stripes: (x, n = 8, duty = 0.5) => { const t = node('fract', 'f', [node('mul', 'f', [lift(x), lift(n)])]); return E(node('step', 'f', [lift(duty), t])); },
  ramp: (x, stops) => {
    const t = lift(x); if (!Array.isArray(stops) || stops.length < 2) throw new CandelaError('E121', 'fx.ramp(x, [[t0, a], [t1, b], …]) needs at least two stops');
    let acc = lift(stops[0][1]);
    for (let i = 1; i < stops.length; i++) { const [t0] = stops[i - 1], [t1, v] = stops[i]; const k = node('clamp', 'f', [node('div', 'f', [node('sub', 'f', [t, constNode(t0)]), constNode((t1 - t0) || 1)]), constNode(0), constNode(1)]); acc = mixNodes(acc, lift(v), k); }
    return E(acc);
  },
  noise: {
    perlin: p => E(node('noise', 'f', [as3(p)])),
    fbm: (p, o = {}) => E(node('fbm', 'f', [as3(p)], { oct: o.octaves || 5, lac: o.lacunarity || 2, gain: o.gain || 0.5, ridged: !!o.ridged })),
    ridged: (p, o = {}) => E(node('fbm', 'f', [as3(p)], { oct: o.octaves || 5, lac: o.lacunarity || 2, gain: o.gain || 0.5, ridged: true })),
    turbulence: (p, o = {}) => E(node('fbm', 'f', [as3(p)], { oct: o.octaves || 5, lac: o.lacunarity || 2, gain: o.gain || 0.5, turb: true })),
    voronoi: p => { const v = node('voronoi', 'v4', [as3(p)]); const pp = as3(p); return { dist: E(node('swz', 'f', [v], 'x')), edge: E(node('swz', 'f', [v], 'y')), cellRandom: E(node('swz', 'f', [v], 'z')), randomVec3: E(node('voronoiVec', 'v3', [pp])) }; },
    worley: p => E(node('swz', 'f', [node('voronoi', 'v4', [as3(p)])], 'x')),
  },
  // a pattern: a lambda traced once, now, with the shading context
  pattern: f => { if (typeof f !== 'function') throw new CandelaError('E121', 'fx.pattern(p => …) takes a lambda'); return E(traceLambda(f)); },
  field: f => { if (typeof f !== 'function') throw new CandelaError('E121', 'fx.field(p => …) takes a lambda'); return E(traceLambda(f, pointContext('a medium density field'))); },
  // procedural bump mapping: a height (metres) as a function of position; perturbs the shading normal by its gradient
  bump: (height, amount = 1) => { const h = typeof height === 'function' ? traceLambda(height) : lift(height); if (h.type !== 'f') throw new CandelaError('E122', 'fx.bump(height): height must be a Float field'); return E(node('bump', 'v3', [h, lift(amount)], { tag: freshTag() })); },
  // a blackbody's colour at luminance 1: exact (Planck × CIE) for constants; for fields, Krystek's rational fit of
  // the Planckian locus in CIE 1960 (u, v), 1000–15000 K, then XYZ (Y = 1) → linear sRGB — built from field nodes
  blackbody: k => {
    const n = lift(k); if (n.op === 'const') return E(constNode(blackbodyRGB(n.x)));
    if (n.type !== 'f') throw new CandelaError('E122', 'fx.blackbody(K): K must be a Float (kelvin)');
    const T = E(n).clamp(800, 20000), T2 = T.mul(T);
    const u = T.mul(1.54118254e-4).add(T2.mul(1.28641212e-7)).add(0.860117757).div(T.mul(8.42420235e-4).add(T2.mul(7.08145163e-7)).add(1));
    const v = T.mul(4.22806245e-5).add(T2.mul(4.20481691e-8)).add(0.317398726).div(T.mul(-2.89741816e-5).add(T2.mul(1.61456053e-7)).add(1));
    const den = u.mul(2).sub(v.mul(8)).add(4), x = u.mul(3).div(den), y = v.mul(2).div(den);
    const X = x.div(y), Z = E(constNode(1)).sub(x).sub(y).div(y);
    const R = X.mul(3.2406).sub(1.5372).sub(Z.mul(0.4986)), G = X.mul(-0.9689).add(1.8758).add(Z.mul(0.0415)), B = X.mul(0.0557).sub(0.2040).add(Z.mul(1.0570));
    return fx.vec3(fx.max(R, 0), fx.max(G, 0), fx.max(B, 0));
  },
  // tangent fields for anisotropic finishes, in object space (material.pbr().tangent(…)): the direction the
  // grooves run. around(axis, centre): circles about an axis (turned, faced); along(dir): straight (brushed,
  // ground); radial(axis, centre): spokes out from an axis (some face-milling patterns)
  tangent: {
    around: (axis = [0, 1, 0], center = [0, 0, 0]) => { const p = node('sub', 'v3', [node('ctx', 'v3', [], 'local'), lift(center)]); return E(node('cross', 'v3', [lift(axis), p])); },
    along: (dir = [1, 0, 0]) => E(lift(dir)),
    radial: (axis = [0, 1, 0], center = [0, 0, 0]) => { const a = lift(axis); const p = node('sub', 'v3', [node('ctx', 'v3', [], 'local'), lift(center)]); return E(node('cross', 'v3', [node('cross', 'v3', [a, p]), a])); },
  },
  // CPU only: real JS per shading point on the reference CPU engine
  host: f => E(node('host', 'v3', [], { tag: freshTag(), fn: hostFns.push(f) - 1 })),
};
export const hostFns = [];
function as3(p) { const n = lift(p); if (n.type === 'v3') return n; if (n.type === 'v2') return node('vec', 'v3', [node('swz', 'f', [n], 'x'), node('swz', 'f', [n], 'y'), constNode(0)]); if (n.type === 'f') return node('splat', 'v3', [n]); return node('swz', 'v3', [n], 'xyz'); }

// ---------- blackbody (used for colour temperatures) ----------
// CIE 1931 colour matching functions, the multi-lobe Gaussian fit of Wyman, Sloan and Shirley (2013)
const g = (x, mu, s1, s2) => { const t = (x - mu) / (x < mu ? s1 : s2); return Math.exp(-0.5 * t * t); };
export const cmf = l => [
  1.056 * g(l, 599.8, 37.9, 31.0) + 0.362 * g(l, 442.0, 16.0, 26.7) - 0.065 * g(l, 501.1, 20.4, 26.2),
  0.821 * g(l, 568.8, 46.9, 40.5) + 0.286 * g(l, 530.9, 16.3, 31.1),
  1.217 * g(l, 437.0, 11.8, 36.0) + 0.681 * g(l, 459.0, 26.0, 13.8),
];
export const xyzToLinearSRGB = ([X, Y, Z]) => [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.2040 * Y + 1.0570 * Z];
export const planck = (lnm, T) => { const l = lnm * 1e-9, h = 6.62607015e-34, c = 2.99792458e8, k = 1.380649e-23; return 2 * h * c * c / (l ** 5 * (Math.exp(h * c / (l * k * T)) - 1)); };
const bbCache = new Map();
export function blackbodyRGB(T) {
  T = Math.max(500, Math.min(40000, +T)); const key = Math.round(T);
  if (bbCache.has(key)) return bbCache.get(key).slice();
  let X = 0, Y = 0, Z = 0;
  for (let l = 380; l <= 780; l += 5) { const p = planck(l, T), c = cmf(l); X += p * c[0]; Y += p * c[1]; Z += p * c[2]; }
  const rgb = xyzToLinearSRGB([X / Y, 1, Z / Y]).map(v => Math.max(0, v));
  const y = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  const out = rgb.map(v => v / y); bbCache.set(key, out); return out.slice();
}

// ---------- code generation (WGSL; GLSL comes from wgsl2glsl) ----------
export const fl = x => { if (!Number.isFinite(x)) x = x > 0 ? 1e30 : -1e30; let s = Number.isInteger(x) ? x.toFixed(1) : String(+x.toPrecision(9)); if (/e/.test(s) && !/\./.test(s.split('e')[0])) s = s.replace('e', '.0e'); return x < 0 ? `(${s})` : s; };
const lit = (v, t) => t === 'f' ? fl(v) : t === 'b' ? String(v) : `${WT[t]}(${v.map(fl).join(', ')})`;
const sp = (code, from, to) => from === to || to === 'f' || to === 'b' ? code : from === 'f' ? `${WT[to]}(${code})` : code;

export class Gen {
  // ctx: name → code for the context fields; uniform(id, type) → code reading the param's slot
  constructor(o = {}) { this.ctx = o.ctx || {}; this.uniform = o.uniform; this.lines = []; this.names = new Map(); this.prefix = o.prefix || 't'; this.k = 0; this.label = o.label || 'this context'; this.subs = o.subs || null; this.onBump = o.onBump; }
  ref(n) {
    if (n.op === 'const') return lit(n.x, n.type);
    if (n.op === 'ctx') { const c = this.ctx[n.x]; if (c == null) throw new CandelaError('E207', `p.${n.x === 'irand' ? 'instance.random' : n.x} is not available in ${this.label}`); return c; }
    if (n.op === 'param') return this.uniform(n.x.id, n.type, n);
    const have = this.names.get(n.id); if (have) return have;
    const code = this.code(n);
    const name = `${this.prefix}${++this.k}`;
    this.lines.push(`let ${name}: ${WT[n.type]} = ${code};`);
    this.names.set(n.id, name);
    return name;
  }
  code(n) {
    const a = n.args.map(x => this.ref(x)), T = n.type, at = n.args.map(x => x.type);
    const S = i => sp(a[i], at[i], T);
    switch (n.op) {
      case 'add': return `(${S(0)} + ${S(1)})`; case 'sub': return `(${S(0)} - ${S(1)})`;
      case 'mul': return `(${S(0)} * ${S(1)})`; case 'div': return `(${S(0)} / ${S(1)})`;
      case 'neg': return `(-${a[0]})`;
      case 'abs': case 'floor': case 'ceil': case 'fract': case 'sign': case 'sin': case 'cos': case 'tan': case 'asin': case 'acos': case 'exp': case 'exp2': case 'log': case 'log2': case 'sqrt':
        return `${n.op}(${a[0]})`;
      case 'atan': return `atan(${a[0]})`;
      case 'atan2': return `atan2(${S(0)}, ${S(1)})`;
      case 'mod': return `fmodp${T === 'f' ? '' : T.slice(1)}(${S(0)}, ${S(1)})`;
      case 'pow': return `pow(${S(0)}, ${S(1)})`;
      case 'min': case 'max': return `${n.op}(${S(0)}, ${S(1)})`;
      case 'clamp': return `clamp(${a[0]}, ${sp(a[1], at[1], T)}, ${sp(a[2], at[2], T)})`;
      case 'mix': return `mix(${S(0)}, ${S(1)}, ${at[2] === 'f' ? a[2] : sp(a[2], at[2], T)})`;
      case 'smoothstep': return `smoothstep(${sp(a[0], at[0], T)}, ${sp(a[1], at[1], T)}, ${a[2]})`;
      case 'step': return `step(${sp(a[0], at[0], T)}, ${a[1]})`;
      case 'dot': return `dot(${a[0]}, ${a[1]})`; case 'cross': return `cross(${a[0]}, ${a[1]})`;
      case 'length': return `length(${a[0]})`; case 'normalize': return `safeNorm${T === 'v3' ? '' : T.slice(1)}(${a[0]})`;
      case 'reflect': return `reflect(${a[0]}, ${a[1]})`;
      case 'maxc': return at[0] === 'v2' ? `max(${a[0]}.x, ${a[0]}.y)` : `max(max(${a[0]}.x, ${a[0]}.y), ${a[0]}.z)`;
      case 'gt': return `(${a[0]} > ${a[1]})`; case 'lt': return `(${a[0]} < ${a[1]})`; case 'gte': return `(${a[0]} >= ${a[1]})`; case 'lte': return `(${a[0]} <= ${a[1]})`;
      case 'eq': return `(abs(${a[0]} - ${a[1]}) < 1e-6)`; case 'ne': return `(abs(${a[0]} - ${a[1]}) >= 1e-6)`;
      case 'and': return `(${a[0]} && ${a[1]})`; case 'or': return `(${a[0]} || ${a[1]})`; case 'not': return `(!${a[0]})`;
      case 'select': return `select(${S(2)}, ${S(1)}, ${a[0]})`;
      case 'swz': return `${a[0]}.${n.x}`;
      case 'splat': return `${WT[T]}(${a[0]})`;
      case 'vec': return `${WT[T]}(${a.join(', ')})`;
      case 'noise': return `noise3(${a[0]})`;
      case 'fbm': return `fbm3(${a[0]}, ${n.x.oct | 0}, ${fl(n.x.lac)}, ${fl(n.x.gain)}, ${n.x.ridged ? 1 : n.x.turb ? 2 : 0})`;
      case 'voronoi': return `voronoi3(${a[0]})`; case 'voronoiVec': return `voronoiVec3(${a[0]})`;
      case 'hash': return `hash13(${a[0]})`;
      case 'bump': { if (!this.onBump) throw new CandelaError('E207', `fx.bump is not available in ${this.label}`); return this.onBump(n, this); }
      case 'host': throw new CandelaError('E710', 'fx.host(…) has no GPU lowering: it runs only on the CPU reference engine (engine.cpu()); use fx.pattern for the GPU', { hint: 'or render with engine.cpu() for a small debug image' });
      case 'rand': return `rnd()`;
      default: throw new CandelaError('E710', `no WGSL lowering for op '${n.op}'`);
    }
  }
}
// generate a standalone function of named arguments (used for bump heights, densities, SDFs, passes)
export function genFunction(name, args, ret, root, o = {}) {
  const ctx = Object.assign({}, o.ctx || {});
  const gen = new Gen({ ctx, uniform: o.uniform, prefix: 'q', label: o.label, onBump: o.onBump });
  const r = gen.ref(root);
  const retCode = sp(r, root.type, ret);
  return `fn ${name}(${args.map(([n, t]) => `${n}: ${t}`).join(', ')}) -> ${WT[ret] || ret} {\n${gen.lines.map(l => '  ' + l).join('\n')}\n  return ${retCode};\n}\n`;
}

// ---------- CPU evaluation ----------
const vmap = (a, b, f) => { const A = Array.isArray(a), B = Array.isArray(b); if (!A && !B) return f(a, b); const n = A ? a.length : b.length; const out = new Array(n); for (let i = 0; i < n; i++) out[i] = f(A ? a[i] : a, B ? b[i] : b); return out; };
const vmap1 = (a, f) => Array.isArray(a) ? a.map(f) : f(a);
const fractJ = x => x - Math.floor(x);
export const H = {
  hash3(p) { const q = [p[0] * 127.1 + p[1] * 311.7 + p[2] * 74.7, p[0] * 269.5 + p[1] * 183.3 + p[2] * 246.1, p[0] * 113.5 + p[1] * 271.9 + p[2] * 124.6]; return q.map(v => -1 + 2 * fractJ(Math.sin(v) * 43758.5453123)); },
  noise3(x) {
    const i = x.map(Math.floor), f = x.map((v, k) => v - i[k]), u = f.map(v => v * v * (3 - 2 * v));
    const gd = (o) => { const h = H.hash3([i[0] + o[0], i[1] + o[1], i[2] + o[2]]); return h[0] * (f[0] - o[0]) + h[1] * (f[1] - o[1]) + h[2] * (f[2] - o[2]); };
    const m = (a, b, t) => a + (b - a) * t;
    return m(m(m(gd([0, 0, 0]), gd([1, 0, 0]), u[0]), m(gd([0, 1, 0]), gd([1, 1, 0]), u[0]), u[1]), m(m(gd([0, 0, 1]), gd([1, 0, 1]), u[0]), m(gd([0, 1, 1]), gd([1, 1, 1]), u[0]), u[1]), u[2]);
  },
  fbm3(p, oct, lac, gain, mode) { let s = 0, a = 0.5, q = p.slice(); for (let k = 0; k < oct; k++) { let n = H.noise3(q); if (mode === 1) n = (1 - Math.abs(n)) ** 2; else if (mode === 2) n = Math.abs(n); s += n * a; a *= gain; q = q.map(v => v * lac); } return s; },
  voronoi3(x) { const n = x.map(Math.floor), f = x.map((v, k) => v - n[k]); let md = 8, md2 = 8, cell = [0, 0, 0]; for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const g = [i, j, k], h = H.hash3([n[0] + i, n[1] + j, n[2] + k]); const r = [0, 1, 2].map(c => g[c] + h[c] * 0.5 + 0.5 - f[c]); const d = r[0] * r[0] + r[1] * r[1] + r[2] * r[2]; if (d < md) { md2 = md; md = d; cell = [n[0] + i, n[1] + j, n[2] + k]; } else if (d < md2) md2 = d; } return [Math.sqrt(md), Math.sqrt(md2) - Math.sqrt(md), fractJ(Math.sin(cell[0] * 7.1 + cell[1] * 157.3 + cell[2] * 113.7) * 43758.5453), 0]; },
  hash13(p) { return fractJ(Math.sin(p[0] * 12.9898 + p[1] * 78.233 + p[2] * 37.719) * 43758.5453); },
};
export function evalNode(root, env = {}, memo = new Map()) {
  const ev = n => {
    if (memo.has(n.id)) return memo.get(n.id);
    let v;
    const a = () => n.args.map(ev);
    switch (n.op) {
      case 'const': v = n.x; break;
      case 'ctx': v = env[n.x] != null ? env[n.x] : n.type === 'f' ? 0 : n.type === 'v2' ? [0, 0] : [0, 0, 0]; break;
      case 'param': v = env.param ? env.param(n.x.id) : 0; break;
      case 'add': { const [x, y] = a(); v = vmap(x, y, (p, q) => p + q); break; }
      case 'sub': { const [x, y] = a(); v = vmap(x, y, (p, q) => p - q); break; }
      case 'mul': { const [x, y] = a(); v = vmap(x, y, (p, q) => p * q); break; }
      case 'div': { const [x, y] = a(); v = vmap(x, y, (p, q) => p / q); break; }
      case 'neg': v = vmap1(ev(n.args[0]), x => -x); break;
      case 'mod': { const [x, y] = a(); v = vmap(x, y, (p, q) => p - q * Math.floor(p / q)); break; }
      case 'pow': { const [x, y] = a(); v = vmap(x, y, Math.pow); break; }
      case 'min': { const [x, y] = a(); v = vmap(x, y, Math.min); break; }
      case 'max': { const [x, y] = a(); v = vmap(x, y, Math.max); break; }
      case 'atan2': { const [x, y] = a(); v = vmap(x, y, Math.atan2); break; }
      case 'clamp': { const [x, lo, hi] = a(); v = vmap(vmap(x, lo, Math.max), hi, Math.min); break; }
      case 'mix': { const [x, y, t] = a(); v = Array.isArray(t) ? x.map((p, i) => p + (y[i] - p) * t[i]) : vmap(x, y, (p, q) => p + (q - p) * t); break; }
      case 'smoothstep': { const [e0, e1, x] = a(); const sm = (p, q, xx) => { const t = Math.max(0, Math.min(1, (xx - p) / ((q - p) || 1e-9))); return t * t * (3 - 2 * t); }; const k = [e0, e1, x].find(Array.isArray); v = k ? k.map((_, i) => sm(Array.isArray(e0) ? e0[i] : e0, Array.isArray(e1) ? e1[i] : e1, Array.isArray(x) ? x[i] : x)) : sm(e0, e1, x); break; }
      case 'step': { const [e, x] = a(); v = vmap(e, x, (p, q) => q >= p ? 1 : 0); break; }
      case 'abs': case 'floor': case 'ceil': case 'sign': case 'sin': case 'cos': case 'tan': case 'asin': case 'acos': case 'atan': case 'exp': case 'log': case 'log2': case 'sqrt': v = vmap1(ev(n.args[0]), Math[n.op]); break;
      case 'fract': v = vmap1(ev(n.args[0]), fractJ); break;
      case 'exp2': v = vmap1(ev(n.args[0]), x => 2 ** x); break;
      case 'dot': { const [x, y] = a(); v = x.reduce((s, p, i) => s + p * y[i], 0); break; }
      case 'cross': { const [x, y] = a(); v = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]]; break; }
      case 'length': { const x = ev(n.args[0]); v = Math.hypot(...x); break; }
      case 'normalize': { const x = ev(n.args[0]); const l = Math.hypot(...x) || 1; v = x.map(p => p / l); break; }
      case 'reflect': { const [i, nn] = a(); const d = i.reduce((s, p, k) => s + p * nn[k], 0); v = i.map((p, k) => p - 2 * d * nn[k]); break; }
      case 'maxc': v = Math.max(...ev(n.args[0])); break;
      case 'gt': { const [x, y] = a(); v = x > y; break; } case 'lt': { const [x, y] = a(); v = x < y; break; }
      case 'gte': { const [x, y] = a(); v = x >= y; break; } case 'lte': { const [x, y] = a(); v = x <= y; break; }
      case 'eq': { const [x, y] = a(); v = Math.abs(x - y) < 1e-6; break; } case 'ne': { const [x, y] = a(); v = Math.abs(x - y) >= 1e-6; break; }
      case 'and': { const [x, y] = a(); v = x && y; break; } case 'or': { const [x, y] = a(); v = x || y; break; } case 'not': v = !ev(n.args[0]); break;
      case 'select': { const [c, x, y] = a(); v = c ? x : y; break; }
      case 'swz': { const x = ev(n.args[0]); const idx = [...n.x].map(c => 'xyzw'.indexOf(c)); v = idx.length === 1 ? x[idx[0]] : idx.map(i => x[i]); break; }
      case 'splat': { const x = ev(n.args[0]); v = new Array(SIZE[n.type]).fill(x); break; }
      case 'vec': v = a(); break;
      case 'noise': v = H.noise3(ev(n.args[0])); break;
      case 'fbm': v = H.fbm3(ev(n.args[0]), n.x.oct, n.x.lac, n.x.gain, n.x.ridged ? 1 : n.x.turb ? 2 : 0); break;
      case 'voronoi': v = H.voronoi3(ev(n.args[0])); break;
      case 'voronoiVec': { const x = ev(n.args[0]); const nn = x.map(Math.floor); v = H.hash3(nn); break; }
      case 'hash': v = H.hash13(ev(n.args[0])); break;
      case 'bump': v = env.N || [0, 1, 0]; break;
      case 'host': v = hostFns[n.x.fn](env) || [1, 0, 1]; break;
      case 'rand': v = Math.random(); break;
      default: throw new CandelaError('E710', `no CPU evaluation for op '${n.op}'`);
    }
    memo.set(n.id, v); return v;
  };
  return ev(root);
}

// ---------- interval bounds (for volume majorants) ----------
const IA = { add: (a, b) => [a[0] + b[0], a[1] + b[1]], sub: (a, b) => [a[0] - b[1], a[1] - b[0]], mul: (a, b) => { const c = [a[0] * b[0], a[0] * b[1], a[1] * b[0], a[1] * b[1]]; return [Math.min(...c), Math.max(...c)]; } };
export function intervalOf(root, env) {
  const memo = new Map();
  const lift1 = (v, f) => Array.isArray(v[0]) ? v.map(f) : f(v);
  const lift2 = (x, y, f) => { const X = Array.isArray(x[0]), Y = Array.isArray(y[0]); if (!X && !Y) return f(x, y); const n = X ? x.length : y.length; return Array.from({ length: n }, (_, i) => f(X ? x[i] : x, Y ? y[i] : y)); };
  const ev = n => {
    if (memo.has(n.id)) return memo.get(n.id);
    let v; const a = () => n.args.map(ev);
    switch (n.op) {
      case 'const': v = Array.isArray(n.x) ? n.x.map(c => [c, c]) : [+n.x, +n.x]; break;
      case 'ctx': v = env[n.x] || (n.type === 'f' ? [0, 1e4] : [[-1e4, 1e4], [-1e4, 1e4], [-1e4, 1e4]]); break;
      case 'param': { const p = env.param ? env.param(n.x.id) : 0; v = Array.isArray(p) ? p.map(c => [c, c]) : [p, p]; break; }
      case 'add': { const [x, y] = a(); v = lift2(x, y, IA.add); break; }
      case 'sub': { const [x, y] = a(); v = lift2(x, y, IA.sub); break; }
      case 'mul': { const [x, y] = a(); v = lift2(x, y, IA.mul); break; }
      case 'div': { const [x, y] = a(); v = lift2(x, y, (p, q) => (q[0] <= 0 && q[1] >= 0) ? [-Infinity, Infinity] : IA.mul(p, [1 / q[1], 1 / q[0]])); break; }
      case 'neg': v = lift1(ev(n.args[0]), x => [-x[1], -x[0]]); break;
      case 'max': { const [x, y] = a(); v = lift2(x, y, (p, q) => [Math.max(p[0], q[0]), Math.max(p[1], q[1])]); break; }
      case 'min': { const [x, y] = a(); v = lift2(x, y, (p, q) => [Math.min(p[0], q[0]), Math.min(p[1], q[1])]); break; }
      case 'clamp': { const [x, lo, hi] = a(); v = lift2(lift2(x, lo, (p, q) => [Math.max(p[0], q[0]), Math.max(p[1], q[1])]), hi, (p, q) => [Math.min(p[0], q[1]), Math.min(p[1], q[1])]); break; }
      case 'abs': v = lift1(ev(n.args[0]), x => x[0] >= 0 ? x : x[1] <= 0 ? [-x[1], -x[0]] : [0, Math.max(-x[0], x[1])]); break;
      case 'sin': case 'cos': v = lift1(ev(n.args[0]), () => [-1, 1]); break;
      case 'smoothstep': case 'step': case 'fract': v = lift1(ev(n.args[n.args.length - 1]), () => [0, 1]); break;
      case 'exp': v = lift1(ev(n.args[0]), x => [Math.exp(x[0]), Math.exp(x[1])]); break;
      case 'sqrt': v = lift1(ev(n.args[0]), x => [Math.sqrt(Math.max(0, x[0])), Math.sqrt(Math.max(0, x[1]))]); break;
      case 'pow': { const [x, y] = a(); v = lift2(x, y, (p, q) => { const c = [p[0] ** q[0], p[0] ** q[1], p[1] ** q[0], p[1] ** q[1]].filter(Number.isFinite); return c.length ? [Math.min(...c, 0), Math.max(...c)] : [-Infinity, Infinity]; }); break; }
      case 'mix': { const [x, y, t] = a(); v = lift2(x, y, (p, q) => [Math.min(p[0], q[0]), Math.max(p[1], q[1])]); break; }
      case 'noise': v = [-1, 1]; break;
      case 'fbm': { let s = 0, amp = 0.5; for (let k = 0; k < n.x.oct; k++) { s += amp; amp *= n.x.gain; } v = n.x.ridged || n.x.turb ? [0, s] : [-s, s]; break; }
      case 'voronoi': v = [[0, 2], [0, 2], [0, 1], [0, 0]]; break;
      case 'hash': v = [0, 1]; break;
      case 'swz': { const x = ev(n.args[0]); const idx = [...n.x].map(c => 'xyzw'.indexOf(c)); v = idx.length === 1 ? x[idx[0]] : idx.map(i => x[i]); break; }
      case 'splat': { const x = ev(n.args[0]); v = new Array(SIZE[n.type]).fill(x); break; }
      case 'vec': v = a(); break;
      case 'length': { const x = ev(n.args[0]); const hi = Math.sqrt(x.reduce((s, c) => s + Math.max(c[0] * c[0], c[1] * c[1]), 0)); v = [0, hi]; break; }
      case 'dot': { const [x, y] = a(); v = x.reduce((s, c, i) => IA.add(s, IA.mul(c, y[i])), [0, 0]); break; }
      case 'select': { const [c, x, y] = a(); v = lift2(x, y, (p, q) => [Math.min(p[0], q[0]), Math.max(p[1], q[1])]); break; }
      default: v = n.type === 'f' ? [-Infinity, Infinity] : new Array(SIZE[n.type]).fill([-Infinity, Infinity]);
    }
    memo.set(n.id, v); return v;
  };
  return ev(root);
}

// ---------- printing ----------
export function printNode(n, depth = 6) {
  const p = (m, d) => {
    if (m.op === 'const') return Array.isArray(m.x) ? `(${m.x.map(v => +v.toFixed(4)).join(', ')})` : String(+(+m.x).toFixed(4));
    if (m.op === 'ctx') return 'p.' + (m.x === 'irand' ? 'instance.random' : m.x);
    if (m.op === 'param') return '$' + m.x.id;
    if (d <= 0) return '…';
    const args = m.args.map(x => p(x, d - 1));
    if (m.op === 'swz') return `${args[0]}.${m.x}`;
    const inf = { add: '+', sub: '-', mul: '·', div: '/' }[m.op];
    if (inf) return `(${args[0]} ${inf} ${args[1]})`;
    const x = m.x && typeof m.x === 'object' && !Array.isArray(m.x) && m.op === 'fbm' ? `, ${m.x.oct} oct` : '';
    return `${m.op}(${args.join(', ')}${x})`;
  };
  return p(n, depth);
}
export function walkNodes(root, fn, seen = new Set()) { if (!root || seen.has(root.id)) return; seen.add(root.id); fn(root); for (const a of root.args) walkNodes(a, fn, seen); }
export function countNodes(root) { let k = 0; walkNodes(root, () => k++); return k; }
export function depsOf(root) { const s = new Set(); walkNodes(root, n => { if (n.op === 'ctx') s.add(n.x); if (n.op === 'param') s.add('param'); if (n.op === 'rand') s.add('rand'); if (n.op === 'host') s.add('host'); }); return s; }
