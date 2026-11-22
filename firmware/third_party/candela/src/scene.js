// scene.js — the grammar: immutable fluent builders for shapes, materials (a BSDF algebra), lights, media,
// cameras and scenes. Every method returns a new builder; a Proxy turns misuse into coded diagnostics.
import { CandelaError, didYouMean, BENIGN, callSite, report, warn, info, fmtLoc } from './diag.js';
import { u, isQ, expectDim, parseQuantity, Quantity, fmtNum } from './units.js';
import { lift, liftE, nodeOf, isExpr, E, node, constNode, parseColor, traceLambda, pointContext, printNode, walkNodes, blackbodyRGB } from './fx.js';
import { isParam } from './params.js';
import { isMesh, matchFace } from './mesh.js';
import { resolveImage } from './hdri.js';

export const COMP = Symbol.for('candela.comp');
export const compOf = x => (x && x[COMP]) || null;
export const isComp = (x, prefix) => { const c = compOf(x); return !!c && (!prefix || c.kind === prefix || c.kind.startsWith(prefix + '.')); };

let CID = 0;
class Comp {
  constructor(kind, props, meta) { this.kind = kind; this.props = Object.freeze(props); this.meta = meta || { frags: [], loc: null, unchecked: [] }; this.cid = ++CID; }
  with(k, v) { return new Comp(this.kind, Object.assign({}, this.props, { [k]: v }), this.meta); }
  withMeta(m) { return new Comp(this.kind, this.props, Object.assign({}, this.meta, m)); }
}

// ---------- method specs per kind ----------
const SPECS = new Map();        // kind → { methods: {name: (comp, ...args) => Comp | value}, getters: {name: comp => value}, family }
const FAMILY = {};              // family → shared methods
const globalFrags = [];         // candela.use(fragment)
export function useFragment(f) { if (!globalFrags.includes(f)) globalFrags.push(f); return f; }
export const clearGlobalFragments = () => { globalFrags.length = 0; };

function spec(kind, family, methods = {}, getters = {}) { SPECS.set(kind, { methods, getters, family }); }
function methodsOf(c) {
  const s = SPECS.get(c.kind) || { methods: {}, getters: {}, family: null };
  const fam = FAMILY[s.family] || {};
  const m = Object.assign({}, COMMON, fam, s.methods);
  for (const f of fragsOf(c)) { if (f.targetsKind(c.kind)) { Object.assign(m, f.methodTable()); } }
  return { m, g: Object.assign({}, COMMON_GET, s.getters) };
}
const fragsOf = c => globalFrags.filter(f => f.targetsKind(c.kind) && !(c.meta.frags || []).includes(f)).concat(c.meta.frags || []);
export const fragmentsOf = fragsOf;

export function wrap(c) {
  const H = {
    get(t, k) {
      if (k === COMP) return c;
      if (typeof k === 'symbol') { if (k === Symbol.toPrimitive) return () => { throw new CandelaError('E204', `a ${c.kind} builder used as a number or string`); }; return undefined; }
      if (k === 'kind') return c.kind;
      const { m, g } = methodsOf(c);
      if (Object.prototype.hasOwnProperty.call(g, k)) return g[k](c);
      if (Object.prototype.hasOwnProperty.call(m, k)) {
        return (...args) => {
          // around-advice from fragments wraps the method
          const arounds = fragsOf(c).filter(f => f.targetsKind(c.kind)).flatMap(f => f.aroundsFor(k));
          let call = (...a) => m[k](c, ...a);
          for (const adv of arounds) { const next = call; call = (...a) => { const self = wrap(c); return compOrValue(adv(next, self, ...a)); }; }
          const r = call(...args);
          return r instanceof Comp ? wrap(r) : r;
        };
      }
      if (k === 'then' || BENIGN.has(k)) return k === 'toString' ? () => `[${c.kind}]` : k === 'toJSON' ? () => describe(c) : undefined;
      throw new CandelaError('E104', `'${k}' is not ${/^[aeiou]/.test(label(c)) ? 'an' : 'a'} ${isAttr(c) ? 'attribute or method' : 'method'} of ${label(c)}`, {
        suggest: didYouMean(k, Object.keys(m).concat(Object.keys(g))),
        hint: (isAttr(c) ? 'attributes: ' : 'methods: ') + Object.keys(m).filter(x => !x.startsWith('_')).slice(0, 18).join(' ') + (Object.keys(m).length > 18 ? ' …' : ''),
      });
    },
    has(t, k) { return k === COMP; },
    set(t, k) { throw new CandelaError('E105', `builders are immutable: '${String(k)}' cannot be assigned. Call .${String(k)}(value) to get a new builder`, { hint: 'in the live world, handles are mutable: world.$(\'#id\').power = …' }); },
  };
  return new Proxy({}, H);
}
const compOrValue = r => (r && r[COMP]) ? r[COMP] : r;
const isAttr = c => c.kind.startsWith('material');
const label = c => c.kind.startsWith('material.') && c.kind !== 'material.plain' ? `Material<${c.kind.slice(9)}>` : c.kind;
const describe = c => ({ kind: c.kind, id: c.props.id || undefined });

// ---------- shared methods ----------
const COMMON = {
  id: (c, s) => { if (typeof s !== 'string' || !/^[\w-]+$/.test(s)) throw new CandelaError('E121', `.id(name): a name of letters, digits, - and _ ; got ${JSON.stringify(s)}`); return c.with('id', s); },
  tag: (c, ...t) => c.with('tags', (c.props.tags || []).concat(t.flat())),
  with: (c, f) => { if (!f || !f.__fragment) throw new CandelaError('E121', `.with(…) takes a fragment (from fragment('name') or candela/fragments)`); if (!f.targetsKind(c.kind)) throw new CandelaError('E131', `fragment '${f.name}' targets ${f.kinds.join(', ')}, not ${c.kind}`); if ((c.meta.frags || []).includes(f)) return c; checkConflicts(c, f); return c.withMeta({ frags: (c.meta.frags || []).concat([f]) }); },
  unchecked: (c, ...codes) => c.withMeta({ unchecked: (c.meta.unchecked || []).concat(codes.length ? codes : ['*']) }),
  _set: (c, k, v) => c.with(k, v),
};
const COMMON_GET = { props: c => c.props, fragments: c => fragsOf(c).map(f => f.name) };
function checkConflicts(c, f) {
  const mine = new Set(Object.keys(f.methodTable()));
  for (const g of fragsOf(c)) { for (const k of Object.keys(g.methodTable())) if (mine.has(k) && !f.override) throw new CandelaError('E140', `fragment '${f.name}' redefines '${k}' from '${g.name}'`, { hint: [`→ ${f.name}.as({ ${k}: '${k}2' })   rename`, `→ fragment('${f.name}', { override: true })   replace`] }); }
}

// values for transform slots: numbers, quantities, params or (time) fields
const ang = (v, what) => { v = parseQuantity(v); if (isExpr(v) || isParam(v)) return v; if (typeof v === 'function') return liftE(v); return expectDim(v, 'angle', what, { hints: { length: 'angles take u.deg(…) or radians' } }); };
const len = (v, what) => { v = parseQuantity(v); if (isExpr(v) || isParam(v)) return v; return expectDim(v, 'length', what); };
const vec3arg = (args, what) => {
  const a = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
  if (a.length !== 3) throw new CandelaError('E121', `${what}(x, y, z) takes three numbers (metres) or an array of three; got ${a.length}`);
  return a.map((v, i) => len(v, `${what} ${'xyz'[i]}`));
};
FAMILY.placed = {
  at: (c, ...a) => c.with('at', vec3arg(a, '.at')),
  x: (c, v) => c.with('at', [len(v, '.x'), ...(c.props.at || [0, 0, 0]).slice(1)]),
  y: (c, v) => { const p = (c.props.at || [0, 0, 0]).slice(); p[1] = len(v, '.y'); return c.with('at', p); },
  z: (c, v) => { const p = (c.props.at || [0, 0, 0]).slice(); p[2] = len(v, '.z'); return c.with('at', p); },
  rotateX: (c, a) => c.with('rot', (c.props.rot || []).concat([['x', ang(a, '.rotateX')]])),
  rotateY: (c, a) => c.with('rot', (c.props.rot || []).concat([['y', ang(a, '.rotateY')]])),
  rotateZ: (c, a) => c.with('rot', (c.props.rot || []).concat([['z', ang(a, '.rotateZ')]])),
  scale: (c, ...a) => { const s = a.length === 1 ? (Array.isArray(a[0]) ? a[0] : [a[0], a[0], a[0]]) : a; if (s.length !== 3) throw new CandelaError('E121', '.scale(s) or .scale(sx, sy, sz)'); return c.with('scale', s.map(v => isParam(v) || isExpr(v) ? v : +parseQuantity(v))); },
  behavior: (c, fn) => { if (typeof fn !== 'function') throw new CandelaError('E121', '.behavior((self, { t, dt }) => …) takes a function'); return c.with('behaviors', (c.props.behaviors || []).concat([fn])); },
  visible: (c, on = true) => c.with('hidden', !on),
};
FAMILY.shape = Object.assign({}, FAMILY.placed, {
  material: (c, m) => { if (!isComp(m, 'material')) { if (isComp(m, 'bsdf')) return c.with('material', compOf(material(m))); throw new CandelaError('E121', `.material(…) takes a material (material.pbr(), material(bsdf.lambert(0.5)), …); got ${m && compOf(m) ? compOf(m).kind : typeof m}`); } return c.with('material', compOf(m)); },
  emit: (c, l) => { if (!isComp(l, 'light.area')) throw new CandelaError('E121', '.emit(light.area().power(u.lm(…))) takes an area light'); if (!['shape.rect', 'shape.disk', 'shape.sphere'].includes(c.kind)) throw new CandelaError('E132', `${c.kind} cannot be an area emitter: use shape.rect, shape.disk or shape.sphere`); return c.with('emit', compOf(l)); },
  child: (c, ...n) => c.with('children', (c.props.children || []).concat(n.flat().map(x => { const k = compOf(x); if (!k) throw new CandelaError('E121', '.child(node)'); return k; }))),
  facing: (c, ...a) => c.with('facing', vec3arg(a, '.facing')),
});

// ---------- shapes ----------
const pos = (v, what) => { v = parseQuantity(v); if (isParam(v)) return v; const x = expectDim(v, 'length', what); if (typeof x === 'number' && !(x > 0)) throw new CandelaError('E121', `${what} must be > 0, got ${x}`); return x; };
const mkShape = (kind, props) => wrap(new Comp('shape.' + kind, Object.assign({ at: [0, 0, 0] }, props), { frags: [], loc: callSite(), unchecked: [] }));
export const shape = {
  sphere: (r = 1) => mkShape('sphere', { r: pos(r, 'shape.sphere(r)') }),
  plane: (size) => mkShape('plane', { size: size == null ? 0 : pos(size, 'shape.plane(size)') }),
  rect: (w = 1, h = 1) => mkShape('rect', { w: pos(w, 'shape.rect(w)'), h: pos(h, 'shape.rect(h)') }),
  disk: (r = 1) => mkShape('disk', { r: pos(r, 'shape.disk(r)') }),
  box: (w = 1, h, d) => mkShape('box', { size: [pos(w, 'shape.box(w)'), pos(h == null ? w : h, 'shape.box(h)'), pos(d == null ? w : d, 'shape.box(d)')] }),
  cube: (s = 1) => mkShape('box', { size: [pos(s, 'shape.cube(s)'), pos(s, 's'), pos(s, 's')] }),
  cylinder: (r = 0.5, h = 1) => mkShape('cylinder', { r: pos(r, 'shape.cylinder(r)'), h: pos(h, 'shape.cylinder(h)') }),
  capsule: (r = 0.3, h = 1) => mkShape('capsule', { r: pos(r, 'shape.capsule(r)'), h: pos(h, 'shape.capsule(h)') }),
  torus: (R = 1, r = 0.25) => mkShape('torus', { R: pos(R, 'shape.torus(R)'), r: pos(r, 'shape.torus(r)') }),
  roundedBox: (w = 1, h, d, radius = 0.05) => mkShape('roundbox', { size: [pos(w, 'w'), pos(h == null ? w : h, 'h'), pos(d == null ? w : d, 'd')], rr: pos(radius, 'radius') }),
  cone: (r = 0.5, h = 1) => mkShape('cone', { r: pos(r, 'shape.cone(r)'), h: pos(h, 'shape.cone(h)') }),
  prism: (o = {}) => mkShape('prism', { apex: o.apex != null ? ang(o.apex, 'apex') : Math.PI / 3, size: o.size != null ? pos(o.size, 'size') : 0.1, depth: o.depth != null ? pos(o.depth, 'depth') : null }),
  // a signed distance field, traced from a lambda of the local position; `bound` is a bounding-sphere radius
  sdf: (fn, o = {}) => {
    if (typeof fn !== 'function' && !isExpr(fn)) throw new CandelaError('E121', 'shape.sdf(p => distance, { bound }) takes a lambda of p.P (local position)');
    const n = typeof fn === 'function' ? traceLambda(fn, pointContext('an SDF')) : nodeOf(fn);
    if (n.type !== 'f') throw new CandelaError('E122', 'an SDF returns a Float (signed distance in metres)');
    return mkShape('sdf', { sdf: n, bound: o.bound != null ? pos(o.bound, 'bound') : 1.5, steps: o.steps || 160, smooth: o.lipschitz || 1 });
  },
  heightfield: (h, o = {}) => {
    const n = typeof h === 'function' ? traceLambda(h, pointContext('a heightfield')) : lift(h);
    const size = o.size != null ? pos(o.size, 'size') : 20, amp = o.height != null ? +parseQuantity(o.height) : 2;
    return mkShape('heightfield', { h: n, size, amp });
  },
  // a tessellated part definition (mesh.gear(…), mesh.fromArrays(…), a CAD bridge's output): one BVH per
  // definition, shared by every instance; .face(selector, material) binds materials to its CAD faces
  mesh: (def) => {
    if (!isMesh(def)) throw new CandelaError('E121', `shape.mesh(def) takes a mesh definition (mesh.gear(…), mesh.revolve(…), mesh.fromArrays(…), mesh.fromOBJ(…)); got ${def === undefined ? 'undefined' : typeof def}`);
    if (!def.count) throw new CandelaError('E121', `shape.mesh: '${def.name}' has no triangles`);
    return mkShape('mesh', { def });
  },
};
for (const k of ['sphere', 'plane', 'rect', 'disk', 'box', 'cylinder', 'capsule', 'torus', 'roundbox', 'cone', 'prism', 'sdf', 'heightfield']) spec('shape.' + k, 'shape');
spec('shape.mesh', 'shape', {
  // a material for some of the part's CAD faces: an id, a glob ('flank*'), a list, or a predicate of the face
  face: (c, sel, m) => {
    if (!isComp(m, 'material')) { if (isComp(m, 'bsdf')) m = material(m); else throw new CandelaError('E121', `.face(selector, material): got ${m && compOf(m) ? compOf(m).kind : typeof m}`); }
    if (!c.props.def.faces.some(f => matchFace(f, sel))) throw new CandelaError('E104', `.face(${JSON.stringify(typeof sel === 'function' ? 'ƒ' : sel)}): no face of '${c.props.def.name}' matches`, { suggest: didYouMean(String(sel), c.props.def.faces.map(f => f.id)) });
    return c.with('faceMats', (c.props.faceMats || []).concat([[sel, compOf(m)]]));
  },
  // materials from the part's and faces' metadata (material, process, axis, colour …) via finish.fromMetadata, or fn(meta)
  autoFinish: (c, fn) => c.with('autoFinish', fn || true),
}, {
  def: c => c.props.def,
  faces: c => c.props.def.faces.map(f => f.id),
  triangles: c => c.props.def.count,
});

// ---------- the BSDF algebra ----------
const field = (v, what, o = {}) => {
  v = parseQuantity(v);
  if (isComp(v)) throw new CandelaError('E121', `${what} takes a field (number, colour, param or pattern), not a ${compOf(v).kind}`);
  const n = lift(v, o.type);
  if (o.type === 'v3' && n.type === 'f') return node('splat', 'v3', [n]);
  if (o.type && n.type !== o.type && !(o.type === 'f' && n.type === 'b')) throw new CandelaError('E122', `${what} takes a ${o.type === 'v3' ? 'colour' : 'scalar'}; got a ${n.type}`);
  if (o.range && n.op === 'const' && typeof n.x === 'number' && (n.x < o.range[0] || n.x > o.range[1])) throw new CandelaError('E121', `${what} ∈ [${o.range[0]}, ${o.range[1]}]${o.note ? ' (' + o.note + ')' : ''}. Got ${n.x}.`);
  return n;
};
const mkB = (kind, props) => wrap(new Comp('bsdf.' + kind, props, { frags: [], loc: callSite(), unchecked: [] }));
const surf = (b, what) => { if (isComp(b, 'bsdf')) return compOf(b); if (isComp(b, 'material')) throw new CandelaError('E121', `${what} takes a BSDF (bsdf.lambert(…), …); a material is not a BSDF — use material.surface() to get one`); throw new CandelaError('E121', `${what} takes a BSDF; got ${typeof b}`); };
const rough = (v, what) => Array.isArray(v) ? [field(v[0], what + '[0]', { type: 'f', range: [0, 1] }), field(v[1], what + '[1]', { type: 'f', range: [0, 1] })] : field(v == null ? 0 : v, what, { type: 'f', range: [0, 1], note: 'perceptual; α = roughness²' });
const iorArg = (v, what) => { if (v && !isParam(v) && !isExpr(v) && v.__ior) return v; v = parseQuantity(v); if (typeof v === 'number' && v <= 0) throw new CandelaError('E121', `${what} must be > 0`); return field(v, what, { type: 'f' }); };
FAMILY.bsdf = {
  normal: (c, n) => c.with('normal', field(n, '.normal', { type: 'v3' })),
  scale: (c, k) => new Comp('bsdf.scale', { a: c, k: field(k, 'scale(k)', { type: 'f', range: [0, 1] }) }, c.meta),
  thinFilm: (c, o = {}) => c.with('film', { thickness: field(o.thickness != null ? parseQuantity(o.thickness) : u.nm(400), 'thinFilm thickness', { type: 'f' }), ior: field(o.ior || 1.33, 'thinFilm ior', { type: 'f' }) }),
  multiscatter: (c, how = 'kulla-conty') => c.with('ms', how !== false && how !== 'none'),
  over: (c, bottom) => compOf(bsdf.layer(wrap(c), bottom)),
};
export const bsdf = {
  lambert: (rho = 0.8) => mkB('lambert', { rho: field(rho, 'bsdf.lambert(ρ)', { type: 'v3' }) }),
  diffuse: (rho = 0.8) => bsdf.lambert(rho),
  dielectric: (o = {}) => {
    if (o.ior != null && o.f0 != null) throw new CandelaError('E121', 'bsdf.dielectric: give ior or f0, not both');
    const ior = o.f0 != null ? null : iorArg(o.ior != null ? o.ior : 1.5, 'dielectric ior');
    return mkB('dielectric', { ior, f0: o.f0 != null ? field(o.f0, 'f0', { type: 'f', range: [0, 1] }) : null, roughness: rough(o.roughness, 'dielectric roughness'), tint: o.tint != null ? field(o.tint, 'tint', { type: 'v3' }) : null, reflectOnly: !!o.reflectOnly, ...tangentOpts(o) });
  },
  conductor: (o = {}) => {
    if (typeof o === 'string') o = { ior: ior.metal(o) };
    const m = o.ior && o.ior.__ior ? o.ior : o.ior ? ior.metal(o.ior) : null;
    return mkB('conductor', { ior: m, f0: o.f0 != null ? field(o.f0, 'f0', { type: 'v3' }) : null, roughness: rough(o.roughness, 'conductor roughness'), ms: o.multiscatter !== false, ...tangentOpts(o) });
  },
  sheen: (o = {}) => mkB('sheen', { color: field(o.color != null ? o.color : 1, 'sheen color', { type: 'v3' }), roughness: rough(o.roughness != null ? o.roughness : 0.5, 'sheen roughness') }),
  thinDielectric: (o = {}) => mkB('thin', { ior: iorArg(o.ior || 1.5, 'thinDielectric ior'), tint: o.tint != null ? field(o.tint, 'tint', { type: 'v3' }) : null }),
  mirror: () => bsdf.conductor.schlick({ f0: 1, roughness: 0 }),
  mix: (a, b, t = 0.5) => mkB('mix', { a: surf(a, 'mix(a, …)'), b: surf(b, 'mix(…, b, …)'), t: field(t, 'mix t', { type: 'f', range: [0, 1] }) }),
  layer: (top, bottom, o = {}) => {
    const t = surf(top, 'layer(top, …)');
    if (t.kind !== 'bsdf.dielectric' && t.kind !== 'bsdf.sheen') throw new CandelaError('E133', `layer(top, bottom): the top must be a dielectric coat (or sheen); got ${t.kind}`, { hint: 'bsdf.layer(bsdf.dielectric({ ior: 1.5, roughness: 0.05 }), base)' });
    const thick = o.thickness != null ? expectDim(o.thickness, 'length', 'layer thickness') : 30e-6;
    return mkB('layer', { top: t, bottom: surf(bottom, 'layer(…, bottom)'), thickness: thick, tint: o.tint != null ? field(o.tint, 'layer tint', { type: 'v3' }) : null });
  },
  add: (a, b) => mkB('add', { a: surf(a, 'add(a, …)'), b: surf(b, 'add(…, b)'), loc: callSite() }),
};
bsdf.conductor.schlick = (o = {}) => mkB('conductor', { ior: null, f0: field(o.f0 != null ? o.f0 : 0.9, 'f0', { type: 'v3' }), roughness: rough(o.roughness, 'conductor roughness'), ms: o.multiscatter !== false, ...tangentOpts(o) });
// anisotropic lobes: roughness [along, across] is measured along `tangent` (an object-space direction field, the
// grooves of a turned, milled or brushed surface), turned by `rotation` turns about the normal
function tangentOpts(o) {
  const r = {};
  if (o.tangent != null) r.tangent = field(o.tangent, 'tangent', { type: 'v3' });
  if (o.rotation != null) r.rotation = field(o.rotation, 'rotation (turns)', { type: 'f' });
  return r;
}
for (const k of ['lambert', 'dielectric', 'conductor', 'sheen', 'thin', 'mix', 'layer', 'add', 'scale']) spec('bsdf.' + k, 'bsdf');

// ---------- refractive indices ----------
// conductors: complex IOR (η, k) at 650, 550, 450 nm, from measured data (Johnson & Christy; Rakic; Palik)
const METALS = {
  Au: { eta: [0.166, 0.433, 1.384], k: [3.15, 2.455, 1.902], name: 'gold' },
  Ag: { eta: [0.141, 0.120, 0.153], k: [4.20, 3.42, 2.66], name: 'silver' },
  Cu: { eta: [0.214, 1.049, 1.226], k: [3.67, 2.59, 2.39], name: 'copper' },
  Al: { eta: [1.47, 0.958, 0.625], k: [7.79, 6.69, 5.47], name: 'aluminium' },
  Fe: { eta: [2.87, 2.92, 2.62], k: [3.08, 2.95, 2.83], name: 'iron' },
  Cr: { eta: [3.19, 3.18, 2.32], k: [3.32, 3.33, 3.13], name: 'chromium' },
  Ti: { eta: [2.74, 2.54, 2.18], k: [3.80, 3.43, 2.99], name: 'titanium' },
  Ni: { eta: [2.02, 1.70, 1.62], k: [3.82, 3.25, 2.84], name: 'nickel' },
  Pt: { eta: [2.38, 2.08, 1.85], k: [4.26, 3.71, 3.14], name: 'platinum' },
  Zn: { eta: [1.25, 0.93, 0.69], k: [5.89, 5.08, 4.20], name: 'zinc' },
  W: { eta: [3.70, 3.53, 3.40], k: [2.89, 2.75, 2.66], name: 'tungsten' },
  brass: { eta: [0.444, 0.527, 1.094], k: [3.695, 2.765, 1.829], name: 'brass' },
};
const GLASSES = {
  'N-BK7': { B: [1.03961212, 0.231792344, 1.01046945], C: [0.00600069867, 0.0200179144, 103.560653] },
  'F2': { B: [1.34533359, 0.209073176, 0.937357162], C: [0.00997743871, 0.0470450767, 111.886764] },
  'SF11': { B: [1.73759695, 0.313747346, 1.89878101], C: [0.013188707, 0.0623068142, 155.23629] },
  'fused-silica': { B: [0.6961663, 0.4079426, 0.8974794], C: [0.0684043 ** 2, 0.1162414 ** 2, 9.896161 ** 2] },
};
const sellmeierAt = (B, C, nm) => { const l2 = (nm / 1000) ** 2; return Math.sqrt(1 + B.reduce((s, b, i) => s + b * l2 / (l2 - C[i]), 0)); };
export const ior = {
  metal: (name) => { const m = METALS[name] || Object.entries(METALS).find(([, v]) => v.name === name)?.[1]; if (!m) throw new CandelaError('E121', `ior.metal('${name}'): no data`, { suggest: didYouMean(String(name), Object.keys(METALS)), hint: 'metals: ' + Object.keys(METALS).join(', ') }); return { __ior: 'metal', name, eta: m.eta, k: m.k, f0: m.eta.map((e, i) => ((e - 1) ** 2 + m.k[i] ** 2) / ((e + 1) ** 2 + m.k[i] ** 2)) }; },
  sellmeier: ({ B, C }) => { if (!B || !C || B.length !== 3 || C.length !== 3) throw new CandelaError('E121', 'ior.sellmeier({ B: [b1, b2, b3], C: [c1, c2, c3] })  (λ in µm)'); const o = { __ior: 'sellmeier', B, C, at: q => sellmeierAt(B, C, isQ(q) ? q.v * 1e9 : q), abbe: () => { const nd = sellmeierAt(B, C, 587.56), nF = sellmeierAt(B, C, 486.13), nC = sellmeierAt(B, C, 656.27); return +((nd - 1) / (nF - nC)).toFixed(2); } }; o.nd = sellmeierAt(B, C, 587.56); return o; },
  glass: (name = 'N-BK7') => { const g = GLASSES[name]; if (!g) throw new CandelaError('E121', `ior.glass('${name}')`, { suggest: didYouMean(name, Object.keys(GLASSES)) }); return ior.sellmeier(g); },
  cauchy: (A = 1.5, Bc = 0.004) => ({ __ior: 'cauchy', A, B: Bc, at: q => A + Bc / ((isQ(q) ? q.v * 1e9 : q) / 1000) ** 2, nd: A + Bc / 0.5876 ** 2 }),
  water: 1.333, ice: 1.31, diamond: 2.42, sapphire: 1.77, acrylic: 1.49, quartz: 1.544,
  list: () => ({ metals: Object.keys(METALS), glasses: Object.keys(GLASSES) }),
};
ior.glass = (name = 'N-BK7') => { const g = GLASSES[name]; if (!g) throw new CandelaError('E121', `ior.glass('${name}')`, { suggest: didYouMean(name, Object.keys(GLASSES)) }); return ior.sellmeier(g); };

// ---------- media ----------
const mkM = (kind, props) => wrap(new Comp('medium.' + kind, props, { frags: [], loc: callSite(), unchecked: [] }));
export const phase = { hg: (g = 0) => { if (!(g > -1 && g < 1)) throw new CandelaError('E121', `phase.hg(g): g ∈ (−1, 1); got ${g}`); return { __phase: 'hg', g }; }, isotropic: () => ({ __phase: 'hg', g: 0 }) };
function mediumProps(o, what) {
  const albedo = o.albedo != null ? field(o.albedo, what + ' albedo', { type: 'v3' }) : constNode([0.9, 0.9, 0.9]);
  let sigmaT;
  if (o.meanFreePath != null) { const mfp = Array.isArray(o.meanFreePath) ? o.meanFreePath.map(x => expectDim(x, 'length', 'meanFreePath')) : expectDim(o.meanFreePath, 'length', 'meanFreePath'); sigmaT = Array.isArray(mfp) ? mfp.map(x => 1 / x) : [1 / mfp, 1 / mfp, 1 / mfp]; }
  else if (o.sigmaT != null) sigmaT = Array.isArray(o.sigmaT) ? o.sigmaT : [o.sigmaT, o.sigmaT, o.sigmaT];
  else sigmaT = [1, 1, 1];
  const ph = o.phase && o.phase.__phase ? o.phase : phase.hg(o.g || 0);
  const extent = o.extent != null ? expectDim(parseQuantity(o.extent), 'length', 'extent') : null;
  return { albedo, sigmaT, g: ph.g, extent };
}
export const medium = {
  homogeneous: (o = {}) => mkM('homogeneous', mediumProps(o, 'medium')),
  // colored glass: what fraction of each channel survives `distance`
  absorbing: (o = {}) => { const tint = parseColor(o.tint) || (Array.isArray(o.tint) ? o.tint : [0.8, 0.9, 0.85]); const d = o.distance != null ? expectDim(o.distance, 'length', 'distance') : 0.05; return mkM('homogeneous', { albedo: constNode([0, 0, 0]), sigmaT: tint.map(t => -Math.log(Math.max(1e-4, Math.min(1, t))) / d), g: 0, absorbing: true }); },
  heterogeneous: (o = {}) => {
    if (o.density == null) throw new CandelaError('E121', 'medium.heterogeneous({ density: fx.field(p => …), bounds: shape.box(…) })');
    const dn = typeof o.density === 'function' ? traceLambda(o.density, pointContext('a density field')) : lift(o.density);
    if (dn.type !== 'f') throw new CandelaError('E122', 'density is a Float field (σt in m⁻¹)');
    const b = o.bounds ? compOf(o.bounds) : compOf(shape.box(2));
    return mkM('heterogeneous', Object.assign(mediumProps(o, 'medium'), { density: dn, bounds: b, majorant: o.majorant == null ? 'auto' : o.majorant, emission: o.emission || null }));
  },
  fog: (o = {}) => medium.homogeneous(Object.assign({ albedo: 0.95, meanFreePath: u.m(40), phase: phase.hg(0.6) }, o)),
  water: () => medium.absorbing({ tint: [0.45, 0.85, 0.9], distance: u.m(1) }),
};
spec('medium.homogeneous', null); spec('medium.heterogeneous', null);

// ---------- materials ----------
FAMILY.material = {
  emission: (c, col, lum) => {
    let n = field(col, 'emission colour', { type: 'v3' });
    if (lum != null) {
      const L = isParam(lum) ? lum : expectDim(parseQuantity(lum), 'luminance', 'emission luminance', { hints: { flux: 'a surface emits luminance (nit); for a light with a power use shape.rect(…).emit(light.area().power(u.lm(…)))' } });
      n = node('mul', 'v3', [n, isParam(L) ? lift(L) : constNode(L)]);
    }
    return c.with('emission', n);
  },
  normal: (c, n) => c.with('normal', field(n, '.normal', { type: 'v3' })),
  interior: (c, m) => { if (!isComp(m, 'medium')) throw new CandelaError('E121', '.interior(medium.homogeneous({…}))'); return c.with('interior', compOf(m)); },
  exterior: (c, m) => { if (!isComp(m, 'medium')) throw new CandelaError('E121', '.exterior(medium…)'); return c.with('exterior', compOf(m)); },
  displace: (c) => { info('I455', 'displacement is ignored on analytic shapes: displace an SDF instead (shape.sdf)'); return c; },
};
const MAT_GET = { surface: c => wrap(lowerSurfaceOnly(c)) };
spec('material.plain', 'material', {}, MAT_GET);

export function material(b) {
  if (!isComp(b, 'bsdf')) throw new CandelaError('E121', `material(bsdf) takes a BSDF — bsdf.lambert(0.5), bsdf.layer(…) — or use material.pbr()`);
  return wrap(new Comp('material.plain', { surface: compOf(b) }, { frags: [], loc: callSite(), unchecked: [] }));
}
// a material kind defined by params and a body over them: its params become fluent methods, sliders and attributes
const DEFINED = new Map();
material.define = (name, specp, body) => {
  if (typeof body !== 'function') throw new CandelaError('E121', 'material.define(name, { attr: param.float(…) }, m => surface)');
  const attrs = {};
  for (const [k, d] of Object.entries(specp)) { const def = d && d.__def; if (!def) throw new CandelaError('E121', `material.define: attribute '${k}' needs a param definition`); attrs[k] = { kind: def.kind, def: def.def, range: def.cfg.range, type: def.kind === 'color' ? 'v3' : 'f' }; }
  const kind = 'material.' + name;
  const methods = {};
  for (const [k, a] of Object.entries(attrs)) methods[k] = (c, v) => c.with(k, field(v, `${name}.${k}`, { type: a.type, range: a.range && a.kind !== 'color' ? a.range : null }));
  spec(kind, 'material', methods, MAT_GET);
  DEFINED.set(kind, { name, attrs, body });
  const make = (init = {}) => { let c = new Comp(kind, {}, { frags: [], loc: callSite(), unchecked: [] }); for (const [k, v] of Object.entries(init)) { if (!methods[k]) throw new CandelaError('E104', `${name}: no attribute '${k}'`, { suggest: didYouMean(k, Object.keys(methods)) }); c = methods[k](c, v); } return wrap(c); };
  make.attrs = attrs; make.kind = kind;
  return make;
};
export const definedMaterial = kind => DEFINED.get(kind);

// ---------- lights ----------
const mkL = (kind, props) => wrap(new Comp('light.' + kind, props, { frags: [], loc: callSite(), unchecked: [] }));
const photo = (v, dim, what, hints) => { v = parseQuantity(v); if (isParam(v)) return v; return expectDim(v, dim, what, { hints }); };
const colorArg = v => { if (isParam(v)) return v; const c = parseColor(v) || (Array.isArray(v) ? v : typeof v === 'number' ? [v, v, v] : null); if (!c) throw new CandelaError('E121', `.color(…) takes '#rrggbb' or [r, g, b]`); return c; };
FAMILY.light = Object.assign({}, FAMILY.placed, {
  temperature: (c, k) => c.with('temperature', isParam(k) ? k : expectDim(parseQuantity(k), 'temperature', '.temperature')).with('color', null),
  color: (c, v) => c.with('color', colorArg(v)).with('temperature', null),
  power: (c, p) => {
    if (c.kind === 'light.sun') throw new CandelaError('E120', 'a directional emitter has no finite power (it is infinitely distant). Specify illuminance at normal incidence: .illuminance(u.lux(100_000))');
    return c.with('power', photo(p, 'flux', '.power', { intensity: `power expects luminous flux [lm]; for an intensity use .intensity(u.cd(…))`, illuminance: 'power is a flux [lm], not an illuminance' })).with('intensity', null).with('luminance', null);
  },
  intensity: (c, i) => c.with('intensity', photo(i, 'intensity', '.intensity', { flux: ['→ .power(u.lm(…))  (isotropic: I = Φ/4π)', `→ .intensity(u.cd(…))`] })).with('power', null),
  luminance: (c, l) => c.with('luminance', photo(l, 'luminance', '.luminance')).with('power', null),
  radius: (c, r) => c.with('radius', len(r, '.radius')),
  lookAt: (c, ...a) => c.with('target', vec3arg(a, '.lookAt')),
  aim: (c, ...a) => c.with('target', vec3arg(a, '.aim')),
});
spec('light.point', 'light', {}, { intensityValue: c => lightIntensity(c) });
spec('light.spot', 'light', {
  cone: (c, a, o) => c.with('cone', ang(a, '.cone')).with('soft', o && o.falloff != null ? ang(o.falloff, 'falloff') : c.props.soft),
  softEdge: (c, a) => c.with('soft', ang(a, '.softEdge')),
  powerMode: (c, m) => { if (m !== 'cone' && m !== 'masked') throw new CandelaError('E121', "powerMode('cone' | 'masked')"); return c.with('powerMode', m); },
}, {});
spec('light.area', 'light', { twoSided: (c, on = true) => c.with('twoSided', on) });
spec('light.sun', 'light', {
  elevation: (c, a) => c.with('elevation', ang(a, '.elevation')), azimuth: (c, a) => c.with('azimuth', ang(a, '.azimuth')),
  illuminance: (c, e) => c.with('illuminance', photo(e, 'illuminance', '.illuminance', { flux: 'the sun is specified by illuminance at normal incidence [lx], not power' })),
  angularDiameter: (c, a) => c.with('diam', ang(a, '.angularDiameter')),
  direction: (c, ...a) => c.with('dir', vec3arg(a, '.direction')),
});
spec('light.sky', 'light', { turbidity: (c, t) => c.with('turbidity', t), fromSun: c => c.with('fromSun', true), scale: (c, k) => c.with('scale', k), elevation: (c, a) => c.with('elevation', ang(a, '.elevation')), azimuth: (c, a) => c.with('azimuth', ang(a, '.azimuth')) });
spec('light.env', 'light', { rotate: (c, a) => c.with('rotation', ang(a, '.rotate')), intensity: (c, l) => c.with('luminance', photo(l, 'luminance', '.intensity')) });
export function lightIntensity(c) {
  const p = c.props;
  if (p.intensity != null && !isParam(p.intensity)) return p.intensity;
  if (p.power != null && !isParam(p.power)) { if (c.kind === 'light.spot' && p.powerMode !== 'masked') { const th = typeof p.cone === 'number' ? p.cone : Math.PI / 6; return p.power / (2 * Math.PI * (1 - Math.cos(th))); } return p.power / (4 * Math.PI); }
  return null;
}
export const light = {
  point: () => mkL('point', { at: [0, 2, 0], power: 800, temperature: 2700 }),
  bulb: (lm = 800, k = 2700) => mkL('point', { at: [0, 2, 0], power: photo(lm, 'flux', 'bulb power'), temperature: k, radius: 0.03 }),
  spot: () => mkL('spot', { at: [0, 3, 0], power: 1200, temperature: 3000, cone: Math.PI / 6, soft: 0.07, target: [0, 0, 0] }),
  area: () => mkL('area', { power: 3000, temperature: 4000 }),
  sun: () => mkL('sun', { elevation: Math.PI / 4, azimuth: Math.PI * 0.75, illuminance: null, diam: 0.53 * Math.PI / 180 }),
  sky: { physical: (o = {}) => mkL('sky', { turbidity: o.turbidity || 3, fromSun: o.sunElevation == null, elevation: o.sunElevation != null ? ang(o.sunElevation, 'sunElevation') : null, azimuth: o.sunAzimuth != null ? ang(o.sunAzimuth, 'sunAzimuth') : null, scale: 1 }) },
  env: {
    uniform: (L = 1) => mkL('env', { env: 'uniform', luminance: photo(L, 'luminance', 'env.uniform') }),
    studio: (o = {}) => mkL('env', { env: 'studio', luminance: o.intensity != null ? photo(o.intensity, 'luminance', 'studio intensity') : 800, rotation: o.rotate != null ? ang(o.rotate, 'rotate') : 0 }),
    gradient: (o = {}) => mkL('env', { env: 'gradient', top: parseColor(o.top || '#9ab8e0'), bottom: parseColor(o.bottom || '#2a2622'), luminance: o.intensity != null ? photo(o.intensity, 'luminance', 'intensity') : 1000 }),
    // an equirectangular HDRI: an asset name (a dropped .hdr), hdri.studio(), hdri.outdoor() or hdri.parse(buffer).
    // Its texels are radiance; `intensity` multiplies them, or `luminance` scales the image to that average.
    hdri: (src, o = {}) => {
      const img = resolveImage(src);
      return mkL('env', { env: 'hdri', image: img, imageName: typeof src === 'string' ? src : img.name || 'image', luminance: o.intensity != null ? (isParam(o.intensity) ? o.intensity : +o.intensity) : 1, average: o.luminance != null ? photo(o.luminance, 'luminance', 'env.hdri luminance') : null, rotation: o.rotate != null ? ang(o.rotate, 'rotate') : 0 });
    },
    night: (o = {}) => mkL('env', { env: 'night', luminance: o.intensity != null ? photo(o.intensity, 'luminance', 'intensity') : 0.05 }),
  },
  // sun + physical sky, as one call
  daylight: (o = {}) => scene.group([
    light.sun().elevation(o.elevation != null ? o.elevation : u.deg(40)).azimuth(o.azimuth != null ? o.azimuth : u.deg(140)),
    light.sky.physical({ turbidity: o.turbidity || 3 }),
  ]),
};
for (const k of ['point', 'spot', 'area', 'sun', 'sky', 'env']) if (!SPECS.has('light.' + k)) spec('light.' + k, 'light');

// ---------- camera ----------
const CAM = {
  at: (c, ...a) => c.with('at', vec3arg(a, '.at')), lookAt: (c, ...a) => c.with('target', vec3arg(a, '.lookAt')),
  focal: (c, f) => { const v = expectDim(parseQuantity(f), 'length', '.focal'); if (!(v > 0.002 && v < 2)) throw new CandelaError('E121', `focal length ${fmtNum(v * 1000)} mm is outside 2–2000 mm`); return c.with('focal', v); },
  fstop: (c, n) => { if (isParam(n)) return c.with('fstop', n); n = +parseQuantity(n); if (!(n >= 0.5)) throw new CandelaError('E123', `N ≥ 0.5 for any lens in air (Abbe sine condition: N = 1 / (2 n sin θ_max)); got f/${n}`); return c.with('fstop', n); },
  shutter: (c, t) => { t = +parseQuantity(t); if (!(t > 0)) throw new CandelaError('E121', 'shutter time > 0 (seconds)'); const k = c.with('shutter', t); return k.props.exposure === 'auto' ? k.with('exposure', 'physical') : k; },
  iso: (c, s) => { if (!(s > 0)) throw new CandelaError('E121', 'iso > 0'); const k = c.with('iso', s); return k.props.exposure === 'auto' ? k.with('exposure', 'physical') : k; },
  exposure: (c, e) => { if (e === 'auto' || e === 'physical' || isParam(e) || typeof e === 'number' || (typeof e === 'string' && e.startsWith('meter:'))) return c.with('exposure', e); if (isQ(e)) return c.with('exposure', e.v); throw new CandelaError('E121', "exposure(ev100 | 'auto' | param)"); },
  focus: (c, d) => c.with('focus', len(d, '.focus')), focusOn: (c, sel) => c.with('focusOn', sel),
  sensor: (c, w) => c.with('sensor', expectDim(parseQuantity(w), 'length', '.sensor')),
  blades: (c, n) => c.with('blades', n), bladeRotation: (c, a) => c.with('bladeRot', ang(a, 'bladeRotation')),
  // motion blur: the scene is sampled at `steps` instants across `shutter` seconds of scene time (or a shutter
  // angle at a frame rate); each path sees the scene at its own instant. Independent of the exposure's shutter.
  motionBlur: (c, o = {}) => {
    if (o === false) return c.with('motion', null);
    let iv = o.shutter != null ? +parseQuantity(o.shutter) : null;
    if (iv == null && o.angle != null) iv = (ang(o.angle, 'motionBlur angle') / (Math.PI * 2)) / (o.fps || 24);
    if (iv == null) iv = 0.5 / (o.fps || 24);
    const steps = Math.round(o.steps != null ? o.steps : 5);
    if (!(iv >= 0) || !(steps >= 2 && steps <= 32)) throw new CandelaError('E121', '.motionBlur({ shutter: seconds | angle + fps, steps: 2–32 })');
    return c.with('motion', { interval: iv, steps });
  },
  aspect: (c, a) => c.with('aspect', a),
};
const camGet = {
  ev100: c => { const p = c.props; if (typeof p.exposure === 'number') return p.exposure; return Math.log2((p.fstop ** 2) / p.shutter) - Math.log2(p.iso / 100); },
  lMax: c => 1.2 * 2 ** camGet.ev100(c),
  fov: c => 2 * Math.atan((c.props.sensor / 2) / c.props.focal),
};
spec('camera.thinLens', null, CAM, camGet); spec('camera.pinhole', null, CAM, camGet);
export const camera = {
  thinLens: () => wrap(new Comp('camera.thinLens', { at: [0, 1.2, 5], target: [0, 0.5, 0], focal: 0.05, fstop: 8, shutter: 1 / 125, iso: 100, exposure: 'auto', sensor: 0.036, focus: null, focusOn: null, blades: 0, bladeRot: 0 }, { frags: [], loc: callSite(), unchecked: [] })),
  pinhole: () => wrap(new Comp('camera.pinhole', { at: [0, 1.2, 5], target: [0, 0.5, 0], focal: 0.05, fstop: 8, shutter: 1 / 125, iso: 100, exposure: 'auto', sensor: 0.036, pinhole: true, blades: 0, bladeRot: 0 }, { frags: [], loc: callSite(), unchecked: [] })),
};

// ---------- scene, groups, scatter ----------
const nodeArg = (x, what) => { const c = compOf(x); if (!c) throw new CandelaError('E121', `${what} takes shapes, lights or groups; got ${x === undefined ? 'undefined' : typeof x}`); if (!/^(shape|light|group)/.test(c.kind)) throw new CandelaError('E121', `${what} takes shapes, lights or groups; got a ${c.kind}${c.kind.startsWith('material') ? ' (give it to a shape: shape.sphere().material(m))' : ''}`); return c; };
FAMILY.group = Object.assign({}, FAMILY.placed, {
  add: (c, ...n) => c.with('nodes', (c.props.nodes || []).concat(n.flat().map(x => nodeArg(x, 'group.add')))),
  material: (c, m) => c.with('material', compOf(m)),
});
spec('group', 'group');
export function scene(opts = {}) {
  return wrap(new Comp('scene', { nodes: [], lights: [], camera: null, medium: null, params: [], units: opts.units || 'photometric', name: opts.name || null }, { frags: [], loc: callSite(), unchecked: [] }));
}
spec('scene', null, {
  add: (c, ...n) => { const nodes = n.flat().filter(x => x != null).map(x => nodeArg(x, 'scene.add')); return c.with('nodes', c.props.nodes.concat(nodes)); },
  light: (c, ...l) => c.with('nodes', c.props.nodes.concat(l.flat().map(x => { const k = compOf(x); if (!k || !/^(light|group)/.test(k.kind)) throw new CandelaError('E121', `scene.light(…) takes lights; got ${k ? k.kind : typeof x}`); return k; }))),
  camera: (c, cam) => { if (!isComp(cam, 'camera')) throw new CandelaError('E121', 'scene.camera(camera.thinLens()…)'); return c.with('camera', compOf(cam)); },
  // one homogeneous medium fills the air (the last one wins); heterogeneous media are bounded, so any number can be added
  medium: (c, ...ms) => { let r = c; for (const m of ms.flat()) { if (!isComp(m, 'medium')) throw new CandelaError('E121', 'scene.medium(medium.homogeneous({…}))'); const mc = compOf(m); r = r.with('media', (r.props.media || []).concat([mc])); if (mc.kind !== 'medium.heterogeneous') r = r.with('medium', mc); } return r; },
  params: (c, P) => c.with('params', c.props.params.concat([P])),
  edit: (c, sel, fn) => editScene(c, sel, fn),
  ground: (c, o = {}) => c.with('nodes', c.props.nodes.concat([compOf(shape.plane().material(material.pbr().baseColor(o.color != null ? o.color : 0.18).roughness(o.roughness != null ? o.roughness : 0.8)).id('ground'))])),
}, {
  cameraNode: c => c.props.camera ? wrap(c.props.camera) : null,
  nodes: c => c.props.nodes.map(wrap),
});
scene.group = (fnOrNodes) => {
  let g = new Comp('group', { nodes: [], at: [0, 0, 0] }, { frags: [], loc: callSite(), unchecked: [] });
  if (typeof fnOrNodes === 'function') {
    const coll = []; let seed = 1; const rng = makeRng(seed);
    const gb = { add: (...n) => { coll.push(...n.flat().map(x => nodeArg(x, 'g.add'))); return gb; } };
    withBuildLambda(() => fnOrNodes(gb, { rng }));
    g = g.with('nodes', coll);
  } else if (Array.isArray(fnOrNodes)) g = g.with('nodes', fnOrNodes.map(x => nodeArg(x, 'scene.group')));
  return wrap(g);
};
// scatter: place instances on a surface; density is a traced pattern evaluated now, on the CPU
scene.scatter = (o = {}) => {
  const { count = 100, seed = 1, place, area = [10, 10], center = [0, 0, 0] } = o;
  if (typeof place !== 'function') throw new CandelaError('E121', 'scene.scatter({ count, place: (i, { rng, P }) => node })');
  const rng = makeRng(seed); const dens = o.density ? (typeof o.density === 'function' && !isExpr(o.density) ? traceLambda(o.density) : lift(o.density)) : null;
  const coll = [];
  withBuildLambda(() => {
    let tries = 0;
    while (coll.length < count && tries < count * 30) {
      tries++;
      const P = [center[0] + (rng() - 0.5) * area[0], center[1], center[2] + (rng() - 0.5) * area[1]];
      if (dens) { const d = evalField(dens, { P, N: [0, 1, 0], uv: [P[0], P[2]] }); if (rng() > d) continue; }
      const n = place(coll.length, { rng, P, N: [0, 1, 0] });
      if (n) coll.push(nodeArg(n, 'scatter place()'));
    }
  });
  return wrap(new Comp('group', { nodes: coll, at: [0, 0, 0] }, { frags: [], loc: callSite(), unchecked: [] }));
};
let evalField = null; export const setEvalField = f => { evalField = f; };
export function makeRng(seed = 1) {
  let s = (seed >>> 0) || 1;
  const r = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return (s >>> 0) / 4294967296; };
  r.range = (a, b) => a + (b - a) * r(); r.int = (a, b) => Math.floor(a + (b - a + 1) * r()); r.pick = (arr, w) => { if (!w) return arr[Math.floor(r() * arr.length)]; const t = w.reduce((a, b) => a + b, 0); let x = r() * t; for (let i = 0; i < arr.length; i++) { x -= w[i]; if (x <= 0) return arr[i]; } return arr[arr.length - 1]; };
  r.angle = () => r() * 2 * Math.PI; r.sign = () => r() < 0.5 ? -1 : 1; r.normal = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  return r;
}
// build lambdas must be deterministic: Math.random inside one is reported (W501)
function withBuildLambda(fn) {
  const orig = Math.random; let used = false;
  Math.random = function () { if (!used) { used = true; warn('W501', 'Math.random() called inside a build lambda: the scene hash will change on every run (no caching, no reproducible renders)', { hint: '→ use the seeded rng the lambda receives: (g, { rng }) => … rng.range(0, 10)' }); } return orig(); };
  try { fn(); } finally { Math.random = orig; }
}

// functional edit: a new scene in which the selected node is replaced by fn(node)
function editScene(sc, sel, fn) {
  let hit = 0;
  const visit = c => {
    if (matches(c, sel)) { hit++; const r = fn(wrap(c)); const k = compOf(r); if (!k) throw new CandelaError('E121', 'scene.edit(sel, fn): fn must return a builder'); return k; }
    if (c.props.nodes) return c.with('nodes', c.props.nodes.map(visit));
    if (c.props.children) return c.with('children', c.props.children.map(visit));
    return c;
  };
  const out = sc.with('nodes', sc.props.nodes.map(visit));
  if (sc.props.camera && matches(sc.props.camera, sel)) { hit++; return out.with('camera', compOf(fn(wrap(sc.props.camera)))); }
  if (!hit) throw new CandelaError('E141', `scene.edit: nothing matches '${sel}'`, { suggest: didYouMean(String(sel).replace(/^#/, ''), allIds(sc)) });
  return out;
}
export function matches(c, sel) {
  if (!sel) return false;
  if (sel.startsWith('#')) return c.props.id === sel.slice(1);
  if (sel.startsWith('.')) return (c.props.tags || []).includes(sel.slice(1));
  return c.kind === sel || c.kind.startsWith(sel + '.') || c.kind.split('.').pop() === sel;
}
export function allIds(sc) { const out = []; const v = c => { if (c.props.id) out.push(c.props.id); (c.props.nodes || []).forEach(v); (c.props.children || []).forEach(v); }; sc.props.nodes.forEach(v); if (sc.props.camera && sc.props.camera.props.id) out.push(sc.props.camera.props.id); return out; }

// ---------- fragments ----------
export function fragment(name, o = {}) {
  if (typeof name !== 'string') throw new CandelaError('E121', "fragment('name')");
  const F = { __fragment: true, name, kinds: [], req: [], ps: {}, ms: {}, ar: {}, lowers: [], vals: [], override: !!o.override, renames: {} };
  F.targetsKind = k => F.kinds.length === 0 || F.kinds.some(t => k === t || k.startsWith(t + '.') || (t === 'material' && k.startsWith('material')));
  F.methodTable = () => {
    const t = {};
    for (const [k, d] of Object.entries(F.ps)) { const nm = F.renames[k] || k; t[nm] = (c, v) => c.with('frag:' + name + ':' + k, isParam(v) ? v : field(v, `${name}.${k}`, { type: d.type })); }
    for (const [k, f] of Object.entries(F.ms)) { const nm = F.renames[k] || k; t[nm] = (c, ...a) => compOrValue(f(wrap(c), ...a)); }
    return t;
  };
  F.aroundsFor = m => F.ar[m] || [];
  const api = {
    __fragment: true, get name() { return name; }, get kinds() { return F.kinds; }, get override() { return F.override; },
    targetsKind: F.targetsKind, methodTable: F.methodTable, aroundsFor: F.aroundsFor,
    targets: (...k) => { F.kinds.push(...k.flat()); return api; },
    requires: (...a) => { F.req.push(...a.flat()); return api; },
    params: (ps) => { for (const [k, d] of Object.entries(ps)) { const def = d.__def; F.ps[k] = { def: def.def, kind: def.kind, type: def.kind === 'color' ? 'v3' : 'f', range: def.cfg.range }; } return api; },
    methods: (ms) => { Object.assign(F.ms, ms); return api; },
    around: (m, fn) => { (F.ar[m] = F.ar[m] || []).push(fn); return api; },
    lower: fn => { F.lowers.push(fn); return api; },
    validate: fn => { F.vals.push(fn); return api; },
    as: (ren) => { const G = fragment(name + '*', o); Object.assign(G._F, F, { renames: ren }); return G; },
    _F: F,
  };
  return api;
}
export const fragInternals = f => f._F;

// ---------- engines, integrators, passes ----------
export const integrator = {
  path: (o = {}) => ({ __integrator: 'path', maxDepth: o.maxDepth || 8, nee: o.nee !== false, mis: o.mis || 'power', rrAfter: (o.rr && o.rr.after) || 3, clamp: o.clamp || 0 }),
  direct: () => ({ __integrator: 'path', maxDepth: 1, nee: true, mis: 'power', rrAfter: 99 }),
  albedo: () => ({ __integrator: 'albedo' }), normals: () => ({ __integrator: 'normals' }), depth: () => ({ __integrator: 'depth' }),
  ao: (o = {}) => ({ __integrator: 'ao', radius: o.radius != null ? expectDim(parseQuantity(o.radius), 'length', 'ao radius') : 0.5 }),
  // returns the integrator itself, also callable (toon or toon()) to match pass.define's factories
  define: (name, o = {}) => { if (typeof o.kernel !== 'function') throw new CandelaError('E121', 'integrator.define(name, { kernel: ({ ray, scene, sampler }) => colour })'); const base = { __integrator: 'custom', name, kernel: o.kernel, params: o.params || {} }; const f = (opts = {}) => Object.assign({}, base, { opts }); for (const [k, v] of Object.entries(base)) Object.defineProperty(f, k, { value: v, enumerable: true, configurable: true }); return f; },
};
const TONEMAPS = ['agx', 'aces', 'neutral', 'reinhard', 'filmic', 'linear'];
export const pass = {
  tonemap: (op = 'agx') => { if (!TONEMAPS.includes(op)) throw new CandelaError('E121', `tonemap('${op}')`, { suggest: didYouMean(op, TONEMAPS), hint: TONEMAPS.join(', ') }); return { __pass: 'tonemap', op }; },
  denoise: (o = {}) => ({ __pass: 'denoise', strength: o.strength || 1, iterations: o.iterations || 4 }),
  bloom: (o = {}) => ({ __pass: 'bloom', strength: o.strength != null ? o.strength : 0.04, threshold: o.threshold || 'physical' }),
  falseColor: () => ({ __pass: 'falseColor' }),
  vignette: (o = {}) => ({ __pass: 'vignette', strength: o.strength != null ? o.strength : 1 }),
  grain: (o = {}) => ({ __pass: 'grain', amount: o.amount != null ? o.amount : 0.03 }),
  define: (name, o = {}) => { if (typeof o.kernel !== 'function') throw new CandelaError('E121', 'pass.define(name, { kernel: ({ color, uv }) => colour })'); const f = (opts = {}) => ({ __pass: 'custom', name, kernel: o.kernel, params: o.params || {}, stage: o.stage || 'hdr', opts }); f.__passFactory = true; return f; },
  encode: (cs = 'srgb') => ({ __pass: 'encode', cs }),
};
export const post = pass;
function engineBuilder(cfg) {
  const B = {
    __engine: true, cfg,
    integrator: i => { if (!i || !i.__integrator) throw new CandelaError('E121', '.integrator(integrator.path({…}))'); return engineBuilder(Object.assign({}, cfg, { integrator: i })); },
    spectral: (o = {}) => engineBuilder(Object.assign({}, cfg, { spectral: o === false ? false : { mode: o.mode || 'hero' } })),
    post: (...p) => { for (const x of p) if (!x || !x.__pass) throw new CandelaError('E121', '.post(pass.tonemap(\'agx\'), …) takes passes'); return engineBuilder(Object.assign({}, cfg, { post: p })); },
    backend: b => { if (!['auto', 'webgpu', 'webgl2'].includes(b)) throw new CandelaError('E121', ".backend('auto' | 'webgpu' | 'webgl2')"); return engineBuilder(Object.assign({}, cfg, { backend: b })); },
    spp: n => engineBuilder(Object.assign({}, cfg, { spp: n })), sppPerFrame: n => engineBuilder(Object.assign({}, cfg, { sppPerFrame: n })),
    scale: s => engineBuilder(Object.assign({}, cfg, { scale: s })), film: (o = {}) => engineBuilder(Object.assign({}, cfg, { scale: o.scale || cfg.scale })),
    maxDepth: d => engineBuilder(Object.assign({}, cfg, { integrator: Object.assign({}, cfg.integrator, { maxDepth: d }) })),
    denoise: (on = true) => engineBuilder(Object.assign({}, cfg, { denoise: on, post: on ? ((cfg.post || []).some(p => p.__pass === 'denoise') ? cfg.post : [pass.denoise()].concat(cfg.post || [])) : (cfg.post || []).filter(p => p.__pass !== 'denoise') })),
    with: f => engineBuilder(Object.assign({}, cfg, { frags: (cfg.frags || []).concat([f]) })),
    differentiable: () => { throw new CandelaError('E710', 'this workbench has no differentiable backend; optimise with a param sweep in the Lab, or ask the agent to search'); },
  };
  return new Proxy(B, { get(t, k) { if (k in t) return t[k]; if (typeof k === 'symbol' || BENIGN.has(k)) return undefined; throw new CandelaError('E104', `'${k}' is not an engine method`, { suggest: didYouMean(String(k), Object.keys(B)) }); } });
}
export const engine = {
  realtime: () => engineBuilder({ name: 'realtime', integrator: integrator.path({ maxDepth: 5, rr: { after: 2 } }), post: [pass.denoise(), pass.tonemap('agx')], scale: 1, sppPerFrame: 1, denoise: true }),
  offline: () => engineBuilder({ name: 'offline', integrator: integrator.path({ maxDepth: 12, rr: { after: 4 } }), post: [pass.tonemap('agx')], scale: 1, sppPerFrame: 2, denoise: false }),
  preview: () => engineBuilder({ name: 'preview', integrator: integrator.path({ maxDepth: 3, rr: { after: 2 } }), post: [pass.denoise(), pass.tonemap('agx')], scale: 0.5, sppPerFrame: 1, denoise: true }),
  cpu: () => engineBuilder({ name: 'cpu', cpu: true, integrator: integrator.path({ maxDepth: 4 }), post: [pass.tonemap('agx')], scale: 0.25 }),
};
export const isEngine = x => !!(x && x.__engine);

// the surface of a plain or defined material, as a builder (for tests and composition)
function lowerSurfaceOnly(c) { if (c.kind === 'material.plain') return c.props.surface; const d = DEFINED.get(c.kind); if (!d) return null; return compOf(d.body(attrsOf(c, d))); }
export function attrsOf(c, d) {
  const m = {};
  for (const [k, a] of Object.entries(d.attrs)) { const v = c.props[k]; m[k] = E(v != null ? v : (a.kind === 'color' ? constNode(a.def) : typeof a.def === 'boolean' ? constNode(a.def ? 1 : 0) : constNode(a.def))); }
  return m;
}
export { Comp, label as compLabel };
