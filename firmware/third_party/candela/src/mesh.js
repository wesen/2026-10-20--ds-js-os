// mesh.js — triangle meshes as a CAD bridge would hand them over: a part definition is a tessellation whose
// triangles keep the persistent id of the CAD face they came from. Normals are smooth within a face and break
// at face boundaries (sharp machined edges). Generators here stand in for a B-rep tessellator: revolved
// (turned) parts, star-shaped extrusions (gears, hex heads, nuts), boxes, merges, arrays and OBJ.
import { CandelaError } from './diag.js';

let REV = 0;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// ---------- the part definition ----------
export class MeshDef {
  // tris: Float32Array, 24 floats per triangle: p0 p1 p2 (9) n0 n1 n2 (9) uv0 uv1 uv2 (6); triFace: face index
  constructor({ name, tris, triFace, faces, meta }) {
    this.name = name || 'part';
    this.tris = tris; this.triFace = triFace;
    this.faces = faces; this.meta = Object.assign({}, meta || {});
    this.count = triFace.length;
    this.revision = ++REV;
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let t = 0; t < this.count; t++) for (let k = 0; k < 3; k++) for (let i = 0; i < 3; i++) { const v = tris[t * 24 + k * 3 + i]; if (v < mn[i]) mn[i] = v; if (v > mx[i]) mx[i] = v; }
    if (!this.count) { mn.fill(0); mx.fill(0); }
    this.bounds = [mn, mx];
    this.radius = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) / 2;
    Object.defineProperty(this, Symbol.for('candela.mesh'), { value: true });
  }
  get triangles() { return this.count; }
  faceIndex(id) { return this.faces.findIndex(f => f.id === id); }
  // a copy with more part metadata (material, finish, colour …), used by finish.fromMetadata
  withMeta(m) { const d = new MeshDef({ name: this.name, tris: this.tris, triFace: this.triFace, faces: this.faces, meta: Object.assign({}, this.meta, m) }); d._blas = this._blas; return d; }
  withFaceMeta(sel, m) { const faces = this.faces.map(f => (matchFace(f, sel) ? Object.assign({}, f, { meta: Object.assign({}, f.meta, m) }) : f)); const d = new MeshDef({ name: this.name, tris: this.tris, triFace: this.triFace, faces, meta: this.meta }); d._blas = this._blas; return d; }
  toString() { return `mesh '${this.name}' · ${this.count} triangles · ${this.faces.length} faces`; }
}
export const isMesh = x => !!(x && x[Symbol.for('candela.mesh')]);

// a face selector: an id, a glob ('flank*'), a regex, a list of those, or a predicate of the face
export function matchFace(f, sel) {
  if (sel == null) return false;
  if (Array.isArray(sel)) return sel.some(s => matchFace(f, s));
  if (typeof sel === 'function') return !!sel(f);
  if (sel instanceof RegExp) return sel.test(f.id);
  const s = String(sel);
  if (s.includes('*')) return new RegExp('^' + s.split('*').map(x => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(f.id);
  return f.id === s;
}

// ---------- building ----------
class Builder {
  constructor(name, meta) { this.name = name; this.meta = meta || {}; this.data = []; this.tf = []; this.faces = []; this.fmap = new Map(); }
  face(id, meta) { if (this.fmap.has(id)) return this.fmap.get(id); const k = this.faces.length; this.faces.push({ id, meta: Object.assign({}, meta || {}) }); this.fmap.set(id, k); return k; }
  // a triangle whose winding is made to agree with its vertex normals (so front faces face outward)
  tri(f, p0, p1, p2, n0, n1, n2, t0 = [0, 0], t1 = [0, 0], t2 = [0, 0]) {
    const g = cross(sub(p1, p0), sub(p2, p0));
    if (dot(g, g) < 1e-30) return;
    const avg = [n0[0] + n1[0] + n2[0], n0[1] + n1[1] + n2[1], n0[2] + n1[2] + n2[2]];
    if (dot(g, avg) < 0) { [p1, p2] = [p2, p1]; [n1, n2] = [n2, n1]; [t1, t2] = [t2, t1]; }
    this.data.push(...p0, ...p1, ...p2, ...n0, ...n1, ...n2, ...t0, ...t1, ...t2); this.tf.push(f);
  }
  quad(f, a, b, c, d, na, nb, nc, nd, ta, tb, tc, td) { this.tri(f, a, b, c, na, nb, nc, ta, tb, tc); this.tri(f, a, c, d, na, nc, nd, ta, tc, td); }
  done() { return new MeshDef({ name: this.name, tris: new Float32Array(this.data), triFace: Uint32Array.from(this.tf), faces: this.faces, meta: this.meta }); }
}

// a solid of revolution about +y: profile [[r, y], …] walked so the material is on the left (axis-bottom → out →
// up the outside → in over the top); each segment is a CAD face (names[i] or 'f<i>'), and segments sharing a name
// are smoothed into one face (a torus, a fillet)
function revolve(profile, o = {}) {
  const N = o.segments || 64, names = o.faces || [], B = new Builder(o.name || 'revolved', o.meta);
  const segs = [];
  for (let i = 0; i + 1 < profile.length; i++) {
    const [r0, y0] = profile[i], [r1, y1] = profile[i + 1];
    const dr = r1 - r0, dy = y1 - y0, L = Math.hypot(dr, dy);
    if (L < 1e-12) continue;
    segs.push({ i, r0, y0, r1, y1, nr: dy / L, ny: -dr / L, name: names[i] || 'f' + i, len: L });
  }
  // smooth normals where neighbouring segments share a face name
  const nAt = (k, end) => {
    const s = segs[k]; let nr = s.nr, ny = s.ny;
    const nb = end === 0 ? segs[k - 1] || (o.closed ? segs[segs.length - 1] : null) : segs[k + 1] || (o.closed ? segs[0] : null);
    if (nb && nb.name === s.name) { nr = (nr + nb.nr) / 2; ny = (ny + nb.ny) / 2; const l = Math.hypot(nr, ny) || 1; nr /= l; ny /= l; }
    return [nr, ny];
  };
  let v = 0;
  for (let k = 0; k < segs.length; k++) {
    const s = segs[k], f = B.face(s.name, Object.assign({ axis: [0, 1, 0] }, (o.faceMeta || {})[s.name] || defaultRevolvedMeta(s)));
    const [a0, b0] = nAt(k, 0), [a1, b1] = nAt(k, 1);
    for (let j = 0; j < N; j++) {
      const p0 = (j / N) * Math.PI * 2, p1 = ((j + 1) / N) * Math.PI * 2;
      const c0 = Math.cos(p0), s0 = Math.sin(p0), c1 = Math.cos(p1), s1 = Math.sin(p1);
      const A = [s.r0 * c0, s.y0, s.r0 * s0], Bp = [s.r0 * c1, s.y0, s.r0 * s1], C = [s.r1 * c1, s.y1, s.r1 * s1], D = [s.r1 * c0, s.y1, s.r1 * s0];
      const nA = [a0 * c0, b0, a0 * s0], nB = [a0 * c1, b0, a0 * s1], nC = [a1 * c1, b1, a1 * s1], nD = [a1 * c0, b1, a1 * s0];
      const u0 = j / N, u1 = (j + 1) / N;
      B.quad(f, A, Bp, C, D, nA, nB, nC, nD, [u0, v], [u1, v], [u1, v + s.len], [u0, v + s.len]);
    }
    v += s.len;
  }
  return B.done();
}
// a guess at how a revolved face was made, for finish.fromMetadata: cylinders and cones are turned, flat annuli faced
function defaultRevolvedMeta(s) { return Math.abs(s.ny) > 0.999 ? { process: 'faced', surface: 'planar' } : Math.abs(s.nr) > 0.999 ? { process: 'turned', surface: 'cylindrical' } : { process: 'turned', surface: 'conical' }; }

// a star-shaped outline about the y axis, extruded over [-h/2, h/2], with an optional round bore: gears, hex
// heads, nuts, washers. outline: [{ a, r, tag }] sorted by angle a ∈ [0, 2π); tags name the side faces
function polarExtrude(outline, h, o = {}) {
  const B = new Builder(o.name || 'extruded', o.meta), n = outline.length, y0 = -h / 2, y1 = h / 2, bore = o.bore || 0;
  const pt = (q, y) => [q.r * Math.cos(q.a), y, q.r * Math.sin(q.a)];
  const top = B.face(o.top || 'top', { process: 'faced', axis: [0, 1, 0], surface: 'planar' }), bot = B.face(o.bottom || 'bottom', { process: 'faced', axis: [0, 1, 0], surface: 'planar' });
  // caps: a strip between the outline and the bore circle at the same angles (or a fan to the centre)
  for (let i = 0; i < n; i++) {
    const q0 = outline[i], q1 = outline[(i + 1) % n];
    const a0 = q0.a, a1 = q1.a + (i + 1 === n ? Math.PI * 2 : 0);
    for (const [y, f, ny] of [[y1, top, 1], [y0, bot, -1]]) {
      const P0 = pt(q0, y), P1 = pt(q1, y), up = [0, ny, 0];
      const uv = p => [p[0], p[2]];
      if (bore > 0) { const I0 = [bore * Math.cos(a0), y, bore * Math.sin(a0)], I1 = [bore * Math.cos(a1), y, bore * Math.sin(a1)]; B.quad(f, I0, P0, P1, I1, up, up, up, up, uv(I0), uv(P0), uv(P1), uv(I1)); }
      else B.tri(f, [0, y, 0], P0, P1, up, up, up, [0, 0], uv(P0), uv(P1));
    }
  }
  // side wall: per-edge normals, averaged at vertices whose two edges carry the same tag
  const en = [];
  for (let i = 0; i < n; i++) { const a = pt(outline[i], 0), b = pt(outline[(i + 1) % n], 0); const t = norm(sub(b, a)); en.push(norm([t[2], 0, -t[0]])); }
  // make the edge normals point outward
  { const a = pt(outline[0], 0), b = pt(outline[1 % n], 0), mid = [(a[0] + b[0]) / 2, 0, (a[2] + b[2]) / 2]; if (dot(en[0], mid) < 0) for (const e of en) { e[0] = -e[0]; e[2] = -e[2]; } }
  // an edge takes the tag of its first point; vertex normals are smoothed between edges with the same tag and
  // stay sharp where the tag (the CAD face) changes
  const tagOf = i => outline[i].tag || 'side';
  let u = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, ip = (i - 1 + n) % n, tag = tagOf(i);
    const f = B.face(tag, (o.faceMeta || {})[tag] || { process: o.sideProcess || 'machined', surface: 'side' });
    const a0 = pt(outline[i], y0), a1 = pt(outline[j], y0), b1 = pt(outline[j], y1), b0 = pt(outline[i], y1);
    const nI = tagOf(ip) === tag ? norm([en[ip][0] + en[i][0], 0, en[ip][2] + en[i][2]]) : en[i];
    const nJ = tagOf(j) === tag ? norm([en[i][0] + en[j][0], 0, en[i][2] + en[j][2]]) : en[i];
    const L = Math.hypot(a1[0] - a0[0], a1[2] - a0[2]);
    B.quad(f, a0, a1, b1, b0, nI, nJ, nJ, nI, [u, 0], [u + L, 0], [u + L, h], [u, h]);
    u += L;
  }
  if (bore > 0) {
    const f = B.face(o.boreName || 'bore', { process: 'turned', axis: [0, 1, 0], surface: 'cylindrical' }), N = o.boreSegments || 48;
    for (let k = 0; k < N; k++) {
      const p0 = k / N * Math.PI * 2, p1 = (k + 1) / N * Math.PI * 2;
      const A = [bore * Math.cos(p0), y0, bore * Math.sin(p0)], Bq = [bore * Math.cos(p1), y0, bore * Math.sin(p1)], C = [bore * Math.cos(p1), y1, bore * Math.sin(p1)], D = [bore * Math.cos(p0), y1, bore * Math.sin(p0)];
      const nA = [-Math.cos(p0), 0, -Math.sin(p0)], nB = [-Math.cos(p1), 0, -Math.sin(p1)];
      B.quad(f, A, Bq, C, D, nA, nB, nB, nA, [k / N, 0], [(k + 1) / N, 0], [(k + 1) / N, h], [k / N, h]);
    }
  }
  return B.done();
}
// polarExtrude's caps need the outline to start at angle 0 and increase; a bore below the outline keeps it solid
const involute = a => Math.tan(a) - a;

// ---------- the public generators ----------
export const mesh = {
  // a box with six faces: right, left, top, bottom, front, back (milled, with their machining direction)
  box(w = 1, h = w, d = w, o = {}) {
    const B = new Builder(o.name || 'box', o.meta), x = w / 2, y = h / 2, z = d / 2;
    const F = [
      ['right', [1, 0, 0], [[x, -y, -z], [x, y, -z], [x, y, z], [x, -y, z]], [0, 0, 1]],
      ['left', [-1, 0, 0], [[-x, -y, z], [-x, y, z], [-x, y, -z], [-x, -y, -z]], [0, 0, 1]],
      ['top', [0, 1, 0], [[-x, y, -z], [-x, y, z], [x, y, z], [x, y, -z]], [1, 0, 0]],
      ['bottom', [0, -1, 0], [[-x, -y, z], [-x, -y, -z], [x, -y, -z], [x, -y, z]], [1, 0, 0]],
      ['front', [0, 0, 1], [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]], [1, 0, 0]],
      ['back', [0, 0, -1], [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]], [1, 0, 0]],
    ];
    for (const [id, n, q, dir] of F) { const f = B.face(id, { process: 'milled', direction: dir, surface: 'planar' }); const side = cross(n, dir); const uv = p => [dot(p, dir), dot(p, side)]; B.quad(f, q[0], q[1], q[2], q[3], n, n, n, n, uv(q[0]), uv(q[1]), uv(q[2]), uv(q[3])); }
    return B.done();
  },
  revolve,
  cylinder(r = 0.5, h = 1, o = {}) { return revolve([[0, -h / 2], [r, -h / 2], [r, h / 2], [0, h / 2]], Object.assign({ name: 'cylinder', faces: ['bottom', 'side', 'top'] }, o)); },
  // a tube / bushing / bearing race: outer, bore, and two annular ends
  tube(ro = 0.5, ri = 0.3, h = 1, o = {}) { return revolve([[ri, -h / 2], [ro, -h / 2], [ro, h / 2], [ri, h / 2], [ri, -h / 2]], Object.assign({ name: 'tube', faces: ['bottom', 'outer', 'top', 'bore'] }, o)); },
  // a shaft with steps: [[length, radius], …] along +y from 0, chamfer-free; each diameter is its own turned face
  shaft(steps, o = {}) {
    const prof = [[0, 0]], names = ['end-0'];
    let y = 0;
    steps.forEach(([len, r], k) => { prof.push([r, y]); names.push(`d${k}`); y += len; prof.push([r, y]); names.push(k + 1 < steps.length ? `shoulder-${k}` : 'end-1'); });
    prof.push([0, y]);
    return revolve(prof, Object.assign({ name: 'shaft', faces: names }, o));
  },
  torus(R = 0.5, r = 0.1, o = {}) {
    const n = o.minor || 24, prof = [];
    for (let k = 0; k <= n; k++) { const a = -Math.PI / 2 - (k / n) * Math.PI * 2; prof.push([R + r * Math.cos(a), r * Math.sin(a)]); }
    return revolve(prof, Object.assign({ name: 'torus', faces: prof.map(() => 'surface'), closed: true, faceMeta: { surface: { process: 'molded' } } }, o));
  },
  // an involute spur gear in the xz plane (axis +y): teeth z, module m (metres), face width, bore radius
  gear(o = {}) {
    const z = o.teeth || 20, m = o.module || 0.004, width = o.width || 0.02, bore = o.bore != null ? o.bore : m * z * 0.15;
    const alpha = o.pressure != null ? o.pressure : 20 * Math.PI / 180;
    const rp = m * z / 2, ra = rp + m, rf = Math.max(rp - 1.25 * m, bore + m * 0.5), rb = rp * Math.cos(alpha);
    const half = Math.PI / (2 * z) + involute(alpha);           // half tooth angle at the base circle, measured from the tooth centre
    const psi = r => (r <= rb ? half : half - involute(Math.acos(rb / r)));
    const S = o.flankSamples || 8, out = [];
    for (let t = 0; t < z; t++) {
      const c = (t / z) * Math.PI * 2;
      const rs = []; for (let k = 0; k <= S; k++) rs.push(Math.max(rf, rb * 0.999) + (ra - Math.max(rf, rb * 0.999)) * (k / S));
      // root land from the previous tooth to this one's leading flank
      out.push({ a: c - Math.PI / z, r: rf, tag: 'root' });
      out.push({ a: c - psi(rs[0]) - 0.0001, r: rf, tag: 'flank' });
      for (let k = 0; k <= S; k++) out.push({ a: c - psi(rs[k]), r: rs[k], tag: k === S ? 'tip' : 'flank' });
      out.push({ a: c + psi(ra), r: ra, tag: 'flank' });
      for (let k = S - 1; k >= 0; k--) out.push({ a: c + psi(rs[k]), r: rs[k], tag: 'flank' });
      out.push({ a: c + psi(rs[0]) + 0.0001, r: rf, tag: 'root' });
    }
    // normalise angles to [0, 2π), keep order
    const norm2 = out.map(q => Object.assign({}, q, { a: ((q.a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) }));
    let k0 = 0; for (let i = 1; i < norm2.length; i++) if (norm2[i].a < norm2[k0].a) k0 = i;
    const ordered = norm2.slice(k0).concat(norm2.slice(0, k0));
    const def = polarExtrude(ordered, width, { name: o.name || `gear z${z}`, bore, top: 'face-1', bottom: 'face-0', faceMeta: { flank: { process: 'hobbed', surface: 'involute' }, tip: { process: 'turned', axis: [0, 1, 0], surface: 'cylindrical' }, root: { process: 'hobbed', surface: 'root' } }, meta: Object.assign({ teeth: z, module: m, pitchRadius: rp }, o.meta || {}) });
    def.pitchRadius = rp; def.teeth = z;
    return def;
  },
  // a regular polygon prism (hex heads, nuts): across-flats, height, optional bore
  prism(sides = 6, acrossFlats = 0.013, h = 0.005, o = {}) {
    const R = acrossFlats / 2 / Math.cos(Math.PI / sides), out = [];
    const subd = o.subdivide || 4;
    for (let k = 0; k < sides; k++) for (let j = 0; j < subd; j++) {
      const a0 = (k / sides) * Math.PI * 2 + Math.PI / sides * (o.rotate ? 1 : 0), a1 = ((k + 1) / sides) * Math.PI * 2 + Math.PI / sides * (o.rotate ? 1 : 0);
      const p0 = [R * Math.cos(a0), R * Math.sin(a0)], p1 = [R * Math.cos(a1), R * Math.sin(a1)], t = j / subd;
      const x = p0[0] + (p1[0] - p0[0]) * t, y = p0[1] + (p1[1] - p0[1]) * t;
      out.push({ a: (Math.atan2(y, x) + Math.PI * 2) % (Math.PI * 2), r: Math.hypot(x, y), tag: `flat-${k}` });
    }
    out.sort((p, q) => p.a - q.a);
    return polarExtrude(out, h, Object.assign({ name: o.name || 'prism', sideProcess: 'milled' }, o));
  },
  // ISO-ish hex bolt along +y (head on top): thread diameter d, shank length, head height ≈ 0.65 d
  hexBolt(o = {}) {
    const d = o.d || 0.008, len = o.length || d * 4, hh = o.head || d * 0.65, s = o.acrossFlats || d * 1.6;
    return mesh.merge([
      { mesh: mesh.prism(6, s, hh, { name: 'head', top: 'head-top', bottom: 'head-bearing' }), at: [0, hh / 2, 0], prefix: '' },
      { mesh: revolve([[0, -len], [d / 2 * 0.92, -len], [d / 2, -len + d * 0.08], [d / 2, 0], [0, 0]], { faces: ['point', 'chamfer', 'shank', 'under-head'], segments: 32 }), at: [0, 0, 0], prefix: '' },
    ], { name: o.name || `M${Math.round(d * 1000)}×${Math.round(len * 1000)} bolt`, meta: Object.assign({ material: 'steel', finish: 'black-oxide', standard: 'ISO 4017' }, o.meta || {}) });
  },
  nut(o = {}) { const d = o.d || 0.008; return mesh.prism(6, o.acrossFlats || d * 1.6, o.height || d * 0.8, { name: o.name || `M${Math.round(d * 1000)} nut`, bore: d / 2, meta: Object.assign({ material: 'steel', finish: 'zinc' }, o.meta || {}) }); },
  washer(o = {}) { const d = o.d || 0.008; return mesh.tube(o.outer || d * 1.05, d / 2 * 1.08, o.thickness || d * 0.2, { name: o.name || `M${Math.round(d * 1000)} washer`, segments: 32, meta: Object.assign({ material: 'steel', finish: 'zinc' }, o.meta || {}) }); },
  // a ball bearing: outer race, inner race, balls (one part definition, faces per element)
  bearing(o = {}) {
    const D = o.outer || 0.035, d = o.inner || 0.015, B = o.width || 0.011, n = o.balls || 9;
    const rm = (D + d) / 4, rb = Math.min((D - d) / 4 * 0.55, B * 0.38);
    const parts = [
      { mesh: mesh.tube(D / 2, rm + rb * 0.55, B, { faces: ['outer-side', 'outer-race-od', 'outer-side-2', 'outer-raceway'], segments: 48 }), at: [0, 0, 0] },
      { mesh: mesh.tube(rm - rb * 0.55, d / 2, B, { faces: ['inner-side', 'inner-raceway', 'inner-side-2', 'bore'], segments: 48 }), at: [0, 0, 0] },
    ];
    const ball = revolve(Array.from({ length: 17 }, (_, k) => { const a = -Math.PI / 2 + Math.PI * k / 16; return [rb * Math.cos(a), rb * Math.sin(a)]; }), { faces: Array(16).fill('ball'), segments: 16 });
    for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; parts.push({ mesh: ball, at: [rm * Math.cos(a), 0, rm * Math.sin(a)], prefix: '' }); }
    return mesh.merge(parts, { name: o.name || `bearing ${Math.round(d * 1000)}×${Math.round(D * 1000)}×${Math.round(B * 1000)}`, meta: Object.assign({ material: 'bearing-steel', finish: 'ground' }, o.meta || {}) });
  },
  // several definitions as one part: translated, optionally rotated about y, face ids prefixed
  merge(parts, o = {}) {
    const B = new Builder(o.name || 'merged', o.meta);
    for (const p of parts) {
      const m = p.mesh, at = p.at || [0, 0, 0], ry = p.rotateY || 0, rx = p.rotateX || 0, c = Math.cos(ry), s = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
      const X = v => { let [x, y, z] = v; [y, z] = [y * cx - z * sx, y * sx + z * cx]; return [x * c + z * s, y, -x * s + z * c]; };
      // face metadata keeps working after the move: the part's own metadata joins each face's, and axes,
      // directions and centres (finish.fromMetadata's grooves) are carried into the merged frame
      const add = q => [q[0] + at[0], q[1] + at[1], q[2] + at[2]];
      const fmap = m.faces.map(f => { const fm = Object.assign({}, m.meta, f.meta); if (fm.process || fm.axis) fm.axis = X(fm.axis || [0, 1, 0]); if (fm.direction) fm.direction = X(fm.direction); fm.center = add(X(fm.center || [0, 0, 0])); return B.face((p.prefix || '') + f.id, fm); });
      for (let t = 0; t < m.count; t++) {
        const b = t * 24, P = k => { const q = X([m.tris[b + k * 3], m.tris[b + k * 3 + 1], m.tris[b + k * 3 + 2]]); return [q[0] + at[0], q[1] + at[1], q[2] + at[2]]; }, Nn = k => X([m.tris[b + 9 + k * 3], m.tris[b + 10 + k * 3], m.tris[b + 11 + k * 3]]), T = k => [m.tris[b + 18 + k * 2], m.tris[b + 19 + k * 2]];
        B.tri(fmap[m.triFace[t]], P(0), P(1), P(2), Nn(0), Nn(1), Nn(2), T(0), T(1), T(2));
      }
    }
    return B.done();
  },
  // indexed arrays from a tessellator: positions [x,y,z…], indices, optional normals/uvs per vertex, a face index
  // per triangle and a face table [{ id, meta }]; without normals each face is shaded flat
  fromArrays(o) {
    const P = o.positions, I = o.indices || Array.from({ length: P.length / 3 }, (_, i) => i), Nn = o.normals, T = o.uvs, F = o.faceIds;
    if (!P || P.length % 3) throw new CandelaError('E121', 'mesh.fromArrays({ positions: [x, y, z, …], indices, normals?, uvs?, faceIds?, faces? })');
    const faces = o.faces ? o.faces.map((f, k) => (typeof f === 'string' ? { id: f, meta: {} } : { id: f.id != null ? String(f.id) : 'f' + k, meta: f.meta || {} })) : null;
    const B = new Builder(o.name || 'mesh', o.meta);
    const fidx = new Map();
    const faceOf = t => { const k = F ? F[t] : 0; if (!fidx.has(k)) fidx.set(k, B.face(faces && faces[k] ? faces[k].id : F ? 'f' + k : 'surface', faces && faces[k] ? faces[k].meta : {})); return fidx.get(k); };
    const v = i => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
    for (let t = 0; t * 3 + 2 < I.length; t++) {
      const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
      const pa = v(a), pb = v(b), pc = v(c);
      const fnrm = norm(cross(sub(pb, pa), sub(pc, pa)));
      const nv = i => (Nn ? [Nn[i * 3], Nn[i * 3 + 1], Nn[i * 3 + 2]] : fnrm), tv = i => (T ? [T[i * 2], T[i * 2 + 1]] : [0, 0]);
      // keep the given winding when no normals are given
      if (Nn) B.tri(faceOf(t), pa, pb, pc, nv(a), nv(b), nv(c), tv(a), tv(b), tv(c));
      else { B.data.push(...pa, ...pb, ...pc, ...fnrm, ...fnrm, ...fnrm, ...tv(a), ...tv(b), ...tv(c)); B.tf.push(faceOf(t)); }
    }
    return B.done();
  },
  // Wavefront OBJ: v / vn / vt / f, with g, o or usemtl naming the faces
  fromOBJ(text, o = {}) {
    const P = [], N = [], T = [], pos = [], nrm = [], uv = [], idx = [], faceIds = [], faces = [], fmap = new Map();
    let cur = 'default', hasN = false;
    const faceK = id => { if (!fmap.has(id)) { fmap.set(id, faces.length); faces.push({ id, meta: {} }); } return fmap.get(id); };
    for (const line of String(text).split('\n')) {
      const s = line.trim().split(/\s+/);
      if (s[0] === 'v') P.push(s.slice(1, 4).map(Number));
      else if (s[0] === 'vn') N.push(s.slice(1, 4).map(Number));
      else if (s[0] === 'vt') T.push(s.slice(1, 3).map(Number));
      else if (s[0] === 'g' || s[0] === 'o' || s[0] === 'usemtl') cur = s.slice(1).join(' ') || cur;
      else if (s[0] === 'f') {
        const vs = s.slice(1).map(x => x.split('/').map(n => (n ? parseInt(n, 10) : 0)));
        const at = (n, L) => (n < 0 ? L + n : n - 1);
        const k0 = pos.length / 3;
        for (const [a, b, c] of vs) { pos.push(...P[at(a, P.length)]); if (c) { hasN = true; nrm.push(...N[at(c, N.length)]); } else nrm.push(0, 0, 0); uv.push(...(b ? T[at(b, T.length)] : [0, 0])); }
        for (let k = 1; k + 1 < vs.length; k++) { idx.push(k0, k0 + k, k0 + k + 1); faceIds.push(faceK(cur)); }
      }
    }
    return mesh.fromArrays({ positions: pos, indices: idx, normals: hasN ? nrm : null, uvs: uv, faceIds, faces, name: o.name || 'obj', meta: o.meta });
  },
};

// ---------- the bottom-level BVH: binned SAH over triangles, built once per definition and cached on it ----------
// nodes: 8 floats (min, left|first, max, count); tris: 28 floats in the kernel's order (see kernel hitMesh)
export function blasOf(def) {
  if (def._blas) return def._blas;
  const n = def.count, T = def.tris;
  const cen = new Float32Array(n * 3), bmn = new Float32Array(n * 3), bmx = new Float32Array(n * 3);
  for (let t = 0; t < n; t++) for (let i = 0; i < 3; i++) {
    const a = T[t * 24 + i], b = T[t * 24 + 3 + i], c = T[t * 24 + 6 + i];
    bmn[t * 3 + i] = Math.min(a, b, c); bmx[t * 3 + i] = Math.max(a, b, c); cen[t * 3 + i] = (a + b + c) / 3;
  }
  const order = new Uint32Array(n); for (let i = 0; i < n; i++) order[i] = i;
  const nodes = []; // [mn0,mn1,mn2,a, mx0,mx1,mx2,cnt]
  const area = (mn, mx) => { const d0 = mx[0] - mn[0], d1 = mx[1] - mn[1], d2 = mx[2] - mn[2]; return d0 * d1 + d1 * d2 + d2 * d0; };
  const BINS = 12, LEAF = 4;
  const bounds = (lo, hi) => { const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], cm = [Infinity, Infinity, Infinity], cx = [-Infinity, -Infinity, -Infinity]; for (let k = lo; k < hi; k++) { const t = order[k]; for (let i = 0; i < 3; i++) { if (bmn[t * 3 + i] < mn[i]) mn[i] = bmn[t * 3 + i]; if (bmx[t * 3 + i] > mx[i]) mx[i] = bmx[t * 3 + i]; const c = cen[t * 3 + i]; if (c < cm[i]) cm[i] = c; if (c > cx[i]) cx[i] = c; } } return { mn, mx, cm, cx }; };
  const mk = () => { nodes.push(new Float64Array(8)); return nodes.length - 1; };
  const root = mk();
  const stack = [[root, 0, n]];
  while (stack.length) {
    const [ni, lo, hi] = stack.pop();
    const b = bounds(lo, hi), N = nodes[ni];
    N[0] = b.mn[0]; N[1] = b.mn[1]; N[2] = b.mn[2]; N[4] = b.mx[0]; N[5] = b.mx[1]; N[6] = b.mx[2];
    const cnt = hi - lo;
    const leaf = () => { N[3] = lo; N[7] = cnt; };
    if (cnt <= LEAF) { leaf(); continue; }
    // best SAH split over the three axes
    let best = { cost: Infinity, axis: -1, split: 0 };
    for (let ax = 0; ax < 3; ax++) {
      const lo_ = b.cm[ax], ext = b.cx[ax] - lo_;
      if (ext < 1e-12) continue;
      const cntB = new Int32Array(BINS), mnB = Array.from({ length: BINS }, () => [Infinity, Infinity, Infinity]), mxB = Array.from({ length: BINS }, () => [-Infinity, -Infinity, -Infinity]);
      for (let k = lo; k < hi; k++) { const t = order[k]; let bi = Math.floor((cen[t * 3 + ax] - lo_) / ext * BINS); if (bi >= BINS) bi = BINS - 1; cntB[bi]++; for (let i = 0; i < 3; i++) { if (bmn[t * 3 + i] < mnB[bi][i]) mnB[bi][i] = bmn[t * 3 + i]; if (bmx[t * 3 + i] > mxB[bi][i]) mxB[bi][i] = bmx[t * 3 + i]; } }
      // sweep
      const lA = new Float64Array(BINS), lC = new Int32Array(BINS); let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], c = 0;
      for (let i = 0; i < BINS - 1; i++) { c += cntB[i]; for (let j = 0; j < 3; j++) { mn[j] = Math.min(mn[j], mnB[i][j]); mx[j] = Math.max(mx[j], mxB[i][j]); } lA[i] = c ? area(mn, mx) : 0; lC[i] = c; }
      mn = [Infinity, Infinity, Infinity]; mx = [-Infinity, -Infinity, -Infinity]; c = 0;
      for (let i = BINS - 1; i > 0; i--) { c += cntB[i]; for (let j = 0; j < 3; j++) { mn[j] = Math.min(mn[j], mnB[i][j]); mx[j] = Math.max(mx[j], mxB[i][j]); } const cost = lA[i - 1] * lC[i - 1] + (c ? area(mn, mx) : 0) * c; if (cost < best.cost && lC[i - 1] > 0 && c > 0) best = { cost, axis: ax, split: i, lo: lo_, ext }; }
    }
    const leafCost = area(b.mn, b.mx) * cnt;
    if (best.axis < 0) { const mid = (lo + hi) >> 1, l = mk(), r = mk(); N[3] = l; N[7] = 0; stack.push([l, lo, mid], [r, mid, hi]); continue; }
    if (best.cost + area(b.mn, b.mx) >= leafCost && cnt <= 16) { leaf(); continue; }
    // partition
    let i = lo, j = hi - 1; const ax = best.axis;
    while (i <= j) { const t = order[i]; let bi = Math.floor((cen[t * 3 + ax] - best.lo) / best.ext * BINS); if (bi >= BINS) bi = BINS - 1; if (bi < best.split) i++; else { order[i] = order[j]; order[j] = t; j--; } }
    let mid = i; if (mid === lo || mid === hi) mid = (lo + hi) >> 1;
    const l = mk(), r = mk(); // children consecutive
    N[3] = l; N[7] = 0;
    stack.push([l, lo, mid], [r, mid, hi]);
  }
  // pack
  const nodeF = new Float32Array(nodes.length * 8); nodes.forEach((N, k) => nodeF.set(N, k * 8));
  const triF = new Float32Array(n * 28);
  for (let k = 0; k < n; k++) {
    const t = order[k], s = t * 24, o = k * 28;
    const p0 = [T[s], T[s + 1], T[s + 2]], p1 = [T[s + 3], T[s + 4], T[s + 5]], p2 = [T[s + 6], T[s + 7], T[s + 8]];
    triF.set([p0[0], p0[1], p0[2], def.triFace[t], p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2], T[s + 18], p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2], T[s + 19],
      T[s + 9], T[s + 10], T[s + 11], T[s + 20], T[s + 12], T[s + 13], T[s + 14], T[s + 21], T[s + 15], T[s + 16], T[s + 17], T[s + 22], T[s + 23], 0, 0, 0], o);
  }
  def._blas = { nodes: nodeF, tris: triF, nNodes: nodes.length, order };
  return def._blas;
}

// CPU ray test against a definition (object space), for picking: { t, tri, face }
export function rayMesh(def, o, d, tmax = Infinity) {
  const B = blasOf(def), N = B.nodes, T = B.tris;
  const inv = [1 / (d[0] || 1e-12), 1 / (d[1] || 1e-12), 1 / (d[2] || 1e-12)];
  let best = tmax, hit = null;
  const st = [0];
  while (st.length) {
    const ni = st.pop(), b = ni * 8;
    let t0 = -Infinity, t1 = best;
    for (let i = 0; i < 3; i++) { const a = (N[b + i] - o[i]) * inv[i], c = (N[b + 4 + i] - o[i]) * inv[i]; t0 = Math.max(t0, Math.min(a, c)); t1 = Math.min(t1, Math.max(a, c)); }
    if (t0 > t1 || t1 < 0) continue;
    const cnt = N[b + 7];
    if (cnt > 0) {
      for (let k = 0; k < cnt; k++) {
        const s = (N[b + 3] + k) * 28;
        const v0 = [T[s], T[s + 1], T[s + 2]], e1 = [T[s + 4], T[s + 5], T[s + 6]], e2 = [T[s + 8], T[s + 9], T[s + 10]];
        const pv = cross(d, e2), det = dot(e1, pv); if (Math.abs(det) < 1e-14) continue;
        const id = 1 / det, tv = sub(o, v0), uu = dot(tv, pv) * id; if (uu < 0 || uu > 1) continue;
        const qv = cross(tv, e1), vv = dot(d, qv) * id; if (vv < 0 || uu + vv > 1) continue;
        const t = dot(e2, qv) * id;
        if (t > 1e-6 && t < best) { best = t; hit = { t, face: T[s + 3] }; }
      }
    } else st.push(N[b + 3], N[b + 3] + 1);
  }
  return hit;
}
