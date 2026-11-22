// ir.js — the scene as an IR: a printed tree (with materials lowered), a DAG for drawing (shared nodes appear
// once), and `explain`, which announces every default the build assumed.
import { compOf, definedMaterial, attrsOf } from './scene.js';
import { printNode, nodeOf, countNodes, depsOf } from './fx.js';
import { isQ, fmtNum } from './units.js';
import { isParam } from './params.js';

const v3 = a => `(${a.map(x => fmtNum(+(+x).toFixed(3))).join(', ')})`;
const show = v => {
  if (v == null) return '—';
  if (typeof v === 'number') return fmtNum(+v.toFixed(4));
  if (isQ(v)) return v.toString();
  if (isParam(v)) return '$' + v.id;
  if (Array.isArray(v)) return v.every(x => typeof x === 'number') ? v3(v) : '[' + v.map(show).join(', ') + ']';
  if (v.op) return printNode(v, 3);
  const n = nodeOf(v); if (n) return printNode(n, 3);
  if (v.__ior) return v.__ior === 'metal' ? `ior.metal(${v.name})` : `ior.${v.__ior}(n_d=${v.nd.toFixed(4)})`;
  if (v.kind) return v.kind;
  return String(v);
};
function surfaceTree(c, ind, out) {
  if (!c) return;
  const p = c.props, k = c.kind.replace('bsdf.', '');
  const attrs = Object.entries(p).filter(([key, v]) => v != null && !['a', 'b', 'top', 'bottom', 'loc'].includes(key)).map(([key, v]) => `${key}=${key === 'film' ? `film(${show(v.thickness)} m)` : show(v)}`).join('  ');
  out.push(`${ind}${k}  ${attrs}`);
  for (const key of ['a', 'b', 'top', 'bottom']) if (p[key]) surfaceTree(p[key], ind + '  ', out);
}
export function irText(sceneB, compiled) {
  const sc = compOf(sceneB); if (!sc) return '';
  const out = [`scene · ${sc.props.nodes.length} nodes · units ${sc.props.units}`];
  const node = (c, ind) => {
    const p = c.props;
    const head = `${c.kind}${p.id ? ' #' + p.id : ''}${p.tags && p.tags.length ? ' .' + p.tags.join(' .') : ''}`;
    const geo = Object.entries(p).filter(([k, v]) => ['r', 'R', 'w', 'h', 'size', 'rr', 'apex', 'bound'].includes(k) && v != null).map(([k, v]) => `${k}=${show(v)}`).join(' ');
    const at = p.at ? ` at ${show(p.at)}` : '';
    const rot = p.rot && p.rot.length ? ' rot ' + p.rot.map(([a, v]) => `${a}:${typeof v === 'number' ? (v * 180 / Math.PI).toFixed(1) + '°' : show(v)}`).join(' ') : '';
    const msh = c.kind === 'shape.mesh' && p.def ? `'${p.def.name}' ${p.def.count} tris · ${p.def.faces.length} faces${p.faceMats ? ` · ${p.faceMats.length} face binding${p.faceMats.length > 1 ? 's' : ''}` : ''}${p.autoFinish ? ' · autoFinish' : ''}` : '';
    out.push(`${ind}${head}  ${msh}${geo}${at}${rot}`);
    if (c.kind.startsWith('light.')) { const keys = ['power', 'intensity', 'illuminance', 'luminance', 'temperature', 'color', 'elevation', 'azimuth', 'turbidity', 'cone', 'radius', 'env']; out.push(`${ind}  ` + keys.filter(k => p[k] != null).map(k => `${k}=${k === 'elevation' || k === 'azimuth' || k === 'cone' ? (typeof p[k] === 'number' ? (p[k] * 180 / Math.PI).toFixed(1) + '°' : show(p[k])) : show(p[k])}`).join('  ')); }
    if (p.material) {
      const m = p.material; const def = definedMaterial(m.kind);
      out.push(`${ind}  ${m.kind}${m.meta.frags && m.meta.frags.length ? ' +' + m.meta.frags.map(f => f.name).join(' +') : ''}`);
      if (def) { const set = Object.keys(def.attrs).filter(k => p.material.props[k] != null); out.push(`${ind}    attrs  ` + (set.length ? set.map(k => `${k}=${show(m.props[k])}`).join('  ') : '(defaults)')); try { out.push(`${ind}    lowered:`); surfaceTree(compOf(def.body(attrsOf(m, def))), ind + '      ', out); } catch (e) { out.push(`${ind}      (lowering failed: ${e.message})`); } }
      else surfaceTree(m.props.surface, ind + '    ', out);
      if (m.props.emission) out.push(`${ind}    emission ${show(m.props.emission)}`);
      if (m.props.interior) out.push(`${ind}    interior ${m.props.interior.kind} σt=${show(m.props.interior.props.sigmaT)} g=${m.props.interior.props.g}`);
    }
    if (p.emit) out.push(`${ind}  emits ${p.emit.kind}  ${['power', 'luminance', 'temperature'].filter(k => p.emit.props[k] != null).map(k => `${k}=${show(p.emit.props[k])}`).join('  ')}`);
    for (const ch of p.children || []) node(ch, ind + '  ');
    for (const ch of p.nodes || []) node(ch, ind + '  ');
  };
  for (const n of sc.props.nodes) node(n, '├─ ');
  if (sc.props.camera) { const cp = sc.props.camera.props; out.push(`└─ ${sc.props.camera.kind}  at ${show(cp.at)} → ${show(cp.target)}  ${fmtNum(cp.focal * 1000)} mm  f/${show(cp.fstop)}  exposure ${show(cp.exposure)}`); }
  for (const m of sc.props.media || (sc.props.medium ? [sc.props.medium] : [])) out.push(`   medium ${m.kind}  σt=${show(m.props.sigmaT)} g=${m.props.g}`);
  if (compiled) { const s = compiled.stats; out.push('', `compiled · ${s.objects} objects · ${s.lights} lights · ${s.materials} material kernels · ${s.params} uniforms · ${s.lines} lines of WGSL`); }
  return out.join('\n');
}
// a DAG for the Graph view: identity of the underlying Comp objects makes sharing visible
export function irGraph(sceneB) {
  const sc = compOf(sceneB); if (!sc) return { nodes: [], edges: [] };
  const nodes = [], edges = [], ids = new Map();
  const add = (key, label, kind, sub) => { if (ids.has(key)) return ids.get(key); const id = nodes.length; nodes.push({ id, label, kind, sub }); ids.set(key, id); return id; };
  const root = add(sc, 'scene', 'scene');
  const surf = (c, from) => { if (!c) return; const id = add(c, c.kind.replace('bsdf.', ''), 'bsdf', c.props.ior && c.props.ior.name ? c.props.ior.name : ''); edges.push([from, id]); for (const k of ['a', 'b', 'top', 'bottom']) if (c.props[k]) surf(c.props[k], id); };
  const visit = (c, from) => {
    const p = c.props;
    const id = add(c, c.kind.split('.').pop() + (p.id ? ' #' + p.id : ''), c.kind.split('.')[0], ''); edges.push([from, id]);
    if (p.material) { const m = p.material; const mid = add(m, m.kind.replace('material.', 'mat.'), 'material', ''); edges.push([id, mid]); const def = definedMaterial(m.kind); if (!def && m.props.surface) surf(m.props.surface, mid); }
    for (const ch of (p.nodes || []).concat(p.children || [])) visit(ch, id);
  };
  for (const n of sc.props.nodes) visit(n, root);
  if (sc.props.camera) { const id = add(sc.props.camera, 'camera', 'camera'); edges.push([root, id]); }
  const uniq = new Set(edges.map(e => e.join(','))); return { nodes, edges: [...uniq].map(s => s.split(',').map(Number)) };
}
export function explain(sceneB, compiled, vp) {
  const sc = compOf(sceneB); if (!sc) return '';
  const lines = [];
  const s = compiled ? compiled.stats : null;
  lines.push(`scene · ${sc.props.nodes.length} nodes · ${s ? s.params : 0} uniforms · units: SI, photometric`);
  const cam = sc.props.camera;
  if (cam) { const p = cam.props; lines.push(`├─ camera   ${cam.kind.split('.')[1]} ${fmtNum(p.focal * 1000)} mm · f/${show(p.fstop)} · 1/${Math.round(1 / p.shutter)} s · ISO ${p.iso} · exposure: ${p.exposure === 'auto' ? 'auto (metered)' : p.exposure === 'physical' ? `physical EV100 ${(Math.log2(p.fstop ** 2 / p.shutter) - Math.log2(p.iso / 100)).toFixed(2)}` : show(p.exposure)}`); }
  else lines.push('├─ camera   ⓘ default: 50 mm thin lens at (0, 1.2, 5) → (0, 0.5, 0), exposure auto');
  if (compiled) {
    if (compiled.sun) lines.push(`├─ sun      elevation ${(compiled.sun.props.elevation * 180 / Math.PI).toFixed(1)}° · ${compiled.sun.props.illuminance != null ? show(compiled.sun.props.illuminance) + ' lx' : 'illuminance from air mass (Kasten–Young + Meinel)'}`);
    if (compiled.sky) lines.push(`├─ sky      Preetham, turbidity ${compiled.sky.props.turbidity}`);
    if (compiled.env) { const ep = compiled.env.props; lines.push(ep.env === 'hdri' ? `├─ env      hdri '${ep.imageName}' ${compiled.hdri ? compiled.hdri.W + '×' + compiled.hdri.H : ''} · ${ep.average != null ? 'average ' + show(ep.average) + ' nit' : '× ' + show(ep.luminance)} · importance-sampled (alias table)` : `├─ env      ${ep.env} · ${show(ep.luminance)} nit`); }
    lines.push(`├─ objects  ${s.objects} · materials ${s.materials} kernels · lights ${s.lights}${s.triangles ? ` · ${s.meshes} mesh definition${s.meshes > 1 ? 's' : ''}, ${s.triangles.toLocaleString()} triangles across instances` : ''}`);
    if (compiled.motionBlur) lines.push(`├─ motion   blur over ${(compiled.motionBlur.interval * 1000).toFixed(1)} ms · ${compiled.motionBlur.steps} steps`);
    if (compiled.animation) lines.push(`├─ poses    export const animation (t → poses by id)`);
    const e = compiled.engine; lines.push(`└─ engine   ${e.name} · ${e.integrator.__integrator}${e.integrator.maxDepth ? ' depth ' + e.integrator.maxDepth : ''}${e.spectral ? ' · spectral (hero λ)' : ''} · ${(e.post || []).map(p => p.__pass + (p.op ? ' ' + p.op : '')).join(', ')}${vp ? ' · backend ' + vp.backendName : ''}`);
  }
  return lines.join('\n');
}
export { countNodes, depsOf };
