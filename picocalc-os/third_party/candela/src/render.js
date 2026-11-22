// render.js — progressive rendering on the GPU: WebGPU compute when the browser has it, WebGL2 fragment shaders
// otherwise. Both run the same kernel source; post-processing (denoise, exposure, tone map, false colour, user
// passes) is shared WGSL too. Shaders are cached by their source, so moving a slider never recompiles.
import { wgslToGlsl } from './wgsl2glsl.js';
import { POST } from './kernel.js';

const TONEMAP_IX = { agx: 0, aces: 1, neutral: 2, reinhard: 3, filmic: 4, linear: 5 };
export { TONEMAP_IX };

// the display function: HDR in, display-referred out
export function displaySource(userPasses = []) {
  const args = p => [0, 1, 2, 3].map(i => `D(${8 + p.slot * 4 + i})`).join(', ');
  const hdr = userPasses.filter(p => p.stage !== 'display').map(p => `  c = ${p.fn}(c, uv, alb, nrm, ${args(p)});`).join('\n');
  const dsp = userPasses.filter(p => p.stage === 'display').map(p => `  t = ${p.fn}(t, uv, alb, nrm, ${args(p)});`).join('\n');
  return POST + userPasses.map(p => p.code).join('\n') + `
fn denoisePx(p: vec2i, stp: i32, res: vec2i, sc: f32, ex: f32) -> vec3f {
  let c0: vec3f = cAt(p);
  let n0: vec4f = nAt(p);
  let a0: vec3f = aAt(p);
  let e0: vec3f = c0 * ex;
  var sum: vec3f = vec3f(0.0, 0.0, 0.0);
  var ws: f32 = 0.0;
  for (var j: i32 = -2; j <= 2; j++) {
    for (var i: i32 = -2; i <= 2; i++) {
      let q: vec2i = clamp(p + vec2i(i, j) * stp, vec2i(0, 0), res - vec2i(1, 1));
      let kx: f32 = select(select(0.375, 0.25, abs(i) == 1), 0.0625, abs(i) == 2);
      let ky: f32 = select(select(0.375, 0.25, abs(j) == 1), 0.0625, abs(j) == 2);
      let c1: vec3f = cAt(q);
      let n1: vec4f = nAt(q);
      let w: f32 = kx * ky * atrousW(e0, c1 * ex, n0.xyz, n1.xyz, a0, aAt(q), sc, 32.0, 0.05) * exp(-abs(n0.w - n1.w) / max(0.03 * n0.w, 0.001));
      sum = sum + c1 * w;
      ws = ws + w;
    }
  }
  return sum / max(ws, 1e-8);
}
fn grainHash(p: vec2f, s: f32) -> f32 { return fract(sin(dot(p + s, vec2f(12.9898, 78.233))) * 43758.5453); }
fn displayPx(p: vec2i, res: vec2i) -> vec4f {
  let d0: vec4f = D(0);
  let d1: vec4f = D(1);
  let d2: vec4f = D(2);
  let d3: vec4f = D(3);
  let uv: vec2f = (vec2f(f32(p.x), f32(p.y)) + 0.5) / vec2f(f32(res.x), f32(res.y));
  let alb: vec3f = aAt(p);
  let nrm: vec3f = nAt(p).xyz;
  let view: i32 = i32(d1.z);
  if (view == 1) { return vec4f(srgbEnc(clamp(alb, vec3f(0.0, 0.0, 0.0), vec3f(1.0, 1.0, 1.0))), 1.0); }
  if (view == 2) { return vec4f(srgbEnc(nrm * 0.5 + 0.5), 1.0); }
  if (view == 3) { let z: f32 = 1.0 - exp(-nAt(p).w * 0.15); return vec4f(z, z, z, 1.0); }
  var c: vec3f = cAt(p) * d0.w;
  if (d2.z > 0.0) {
    var g: vec3f = vec3f(0.0, 0.0, 0.0);
    for (var k: i32 = 0; k < 12; k++) {
      let a: f32 = f32(k) * 2.39996;
      let r: f32 = 3.0 + f32(k) * 2.2;
      let q: vec2i = clamp(p + vec2i(i32(cos(a) * r), i32(sin(a) * r)), vec2i(0, 0), res - vec2i(1, 1));
      g = g + max(cAt(q) * d0.w - 1.0, vec3f(0.0, 0.0, 0.0));
    }
    c = c + g * (d2.z / 12.0);
  }
${hdr}
  if (d1.y > 0.5) { return vec4f(falseColor(lum(c)), 1.0); }
  if (d2.x > 0.0) {
    let ndc: vec2f = uv * 2.0 - 1.0;
    let tc: f32 = 1.0 / sqrt(1.0 + sq(ndc.x * d3.x) + sq(ndc.y * d3.y));
    c = c * mix(1.0, tc * tc * tc * tc, d2.x);
  }
  var t: vec3f = tonemap(c, i32(d1.x));
  if (d2.y > 0.0) { let n: f32 = grainHash(vec2f(f32(p.x), f32(p.y)), d2.w) - 0.5; t = t * (1.0 + n * d2.y * 2.0); }
${dsp}
  return vec4f(srgbEnc(clamp(t, vec3f(0.0, 0.0, 0.0), vec3f(1.0, 1.0, 1.0))), 1.0);
}
`;
}

// ---------------- WebGPU ----------------
export class GPURenderer {
  static async create(canvas) {
    if (!navigator.gpu) return null;
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }).catch(() => null);
    if (!adapter) return null;
    const device = await adapter.requestDevice({ requiredLimits: { maxStorageBufferBindingSize: Math.min(adapter.limits.maxStorageBufferBindingSize, 1 << 30), maxBufferSize: Math.min(adapter.limits.maxBufferSize, 1 << 30), maxStorageBuffersPerShaderStage: Math.min(adapter.limits.maxStorageBuffersPerShaderStage, 10) } }).catch(() => null);
    if (!device) return null;
    const r = new GPURenderer(); r.device = device; r.canvas = canvas; r.name = 'WebGPU';
    r.info = adapter.info ? `${adapter.info.vendor || ''} ${adapter.info.architecture || ''}`.trim() : '';
    r.ctx = canvas.getContext('webgpu'); r.format = navigator.gpu.getPreferredCanvasFormat();
    r.ctx.configure({ device, format: r.format, alphaMode: 'opaque' });
    r.cache = new Map(); r.lost = false;
    device.lost.then(i => { r.lost = true; r.lostInfo = i && i.message; });
    return r;
  }
  prelude(nU) {
    return `@group(0) @binding(0) var<storage, read> uni: array<vec4f>;
@group(0) @binding(1) var<storage, read> objs: array<vec4f>;
@group(0) @binding(2) var<storage, read> lits: array<vec4f>;
@group(0) @binding(3) var<storage, read> bvhs: array<vec4f>;
@group(0) @binding(4) var<storage, read> sd: array<vec4f>;
@group(0) @binding(5) var<storage, read_write> accum: array<vec4f>;
@group(0) @binding(6) var<storage, read_write> aovA: array<vec4f>;
@group(0) @binding(7) var<storage, read_write> aovN: array<vec4f>;
fn U(i: i32) -> vec4f { return uni[i]; }
fn objF(i: i32) -> vec4f { return objs[i]; }
fn litF(i: i32) -> vec4f { return lits[i]; }
fn bvhF(i: i32) -> vec4f { return bvhs[i]; }
fn sdF(i: i32) -> vec4f { return sd[i]; }
`;
  }
  async compile(compiled, dispSrc) {
    const dev = this.device;
    const key = compiled.shared;
    let pipe = this.cache.get(key);
    if (!pipe) {
      const code = this.prelude(compiled.nU) + compiled.shared + `
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let res: vec2f = U(0).xy;
  if (f32(gid.x) >= res.x || f32(gid.y) >= res.y) { return; }
  let o: PixOut = renderPixel(vec2f(f32(gid.x), f32(gid.y)), u32(U(0).z));
  let ix: u32 = gid.y * u32(res.x) + gid.x;
  if (U(0).z < 0.5) { accum[ix] = o.c; if (i32(U(21).w) != 20) { aovA[ix] = o.alb; aovN[ix] = o.nrm; } }
  else { accum[ix] = accum[ix] + o.c; aovA[ix] = aovA[ix] + o.alb; aovN[ix] = aovN[ix] + o.nrm; }
}
`;
      const mod = dev.createShaderModule({ code });
      const info = await mod.getCompilationInfo();
      const errs = info.messages.filter(m => m.type === 'error');
      if (errs.length) { const e = new Error('WGSL: ' + errs.slice(0, 3).map(m => `line ${m.lineNum - this.prelude().split('\n').length + 1}: ${m.message}`).join('; ')); e.shaderErrors = errs.map(m => ({ line: m.lineNum, message: m.message })); e.source = code; throw e; }
      dev.pushErrorScope('validation');
      const p = await dev.createComputePipelineAsync({ layout: 'auto', compute: { module: mod, entryPoint: 'main' } });
      const ve = await dev.popErrorScope(); if (ve) throw new Error('WebGPU pipeline: ' + ve.message);
      pipe = { trace: p, code };
      this.cache.set(key, pipe);
      if (this.cache.size > 24) this.cache.delete(this.cache.keys().next().value);
    }
    this.pipe = pipe; this.source = pipe.code;
    // post
    const dkey = dispSrc;
    if (!this.post || this.post.key !== dkey) {
      const pre = `@group(0) @binding(0) var<storage, read> dsp: array<vec4f>;
@group(0) @binding(1) var<storage, read> src: array<vec4f>;
@group(0) @binding(2) var<storage, read> aovA: array<vec4f>;
@group(0) @binding(3) var<storage, read> aovN: array<vec4f>;
fn D(i: i32) -> vec4f { return dsp[i]; }
fn W() -> i32 { return i32(dsp[0].x); }
fn cAt(p: vec2i) -> vec3f { let i: i32 = p.y * W() + p.x; let v: vec4f = src[i]; return v.xyz / max(v.w, 1.0); }
fn aAt(p: vec2i) -> vec3f { let i: i32 = p.y * W() + p.x; return aovA[i].xyz / max(dsp[0].z, 1.0); }
fn nAt(p: vec2i) -> vec4f { let i: i32 = p.y * W() + p.x; let n: vec4f = aovN[i] / max(dsp[0].z, 1.0); return vec4f(safeNorm(n.xyz), n.w); }
fn sq(x: f32) -> f32 { return x * x; }
fn lum(c: vec3f) -> f32 { return dot(c, vec3f(0.2126, 0.7152, 0.0722)); }
fn safeNorm(v: vec3f) -> vec3f { let l: f32 = length(v); return select(vec3f(0.0, 1.0, 0.0), v / max(l, 1e-20), l > 1e-20); }
`;
      const den = dev.createShaderModule({ code: pre + dispSrc + `
@group(0) @binding(4) var<storage, read_write> dst: array<vec4f>;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let res: vec2i = vec2i(i32(D(0).x), i32(D(0).y));
  if (i32(gid.x) >= res.x || i32(gid.y) >= res.y) { return; }
  let p: vec2i = vec2i(i32(gid.x), i32(gid.y));
  let c: vec3f = denoisePx(p, i32(D(4).x), res, D(4).y, D(0).w);
  dst[p.y * res.x + p.x] = vec4f(c, 1.0);
}
` });
      const disp = dev.createShaderModule({ code: pre + dispSrc + `
@group(0) @binding(4) var outTex: texture_storage_2d<rgba8unorm, write>;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let res: vec2i = vec2i(i32(D(0).x), i32(D(0).y));
  if (i32(gid.x) >= res.x || i32(gid.y) >= res.y) { return; }
  let p: vec2i = vec2i(i32(gid.x), i32(gid.y));
  textureStore(outTex, p, displayPx(p, res));
}
` });
      for (const m of [den, disp]) { const i = await m.getCompilationInfo(); const e = i.messages.filter(x => x.type === 'error'); if (e.length) throw new Error('WGSL post: ' + e.slice(0, 2).map(x => `${x.lineNum}: ${x.message}`).join('; ')); }
      const blit = dev.createShaderModule({ code: `
@group(0) @binding(0) var tex: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;
struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f, }
@vertex fn vs(@builtin(vertex_index) i: u32) -> VO { var o: VO; let x: f32 = f32((i << 1u) & 2u); let y: f32 = f32(i & 2u); o.pos = vec4f(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0); o.uv = vec2f(x, y); return o; }
@fragment fn fs(v: VO) -> @location(0) vec4f { return textureSampleLevel(tex, smp, v.uv, 0.0); }
` });
      this.post = {
        key: dkey,
        den: await dev.createComputePipelineAsync({ layout: 'auto', compute: { module: den, entryPoint: 'main' } }),
        disp: await dev.createComputePipelineAsync({ layout: 'auto', compute: { module: disp, entryPoint: 'main' } }),
        blit: await dev.createRenderPipelineAsync({ layout: 'auto', vertex: { module: blit, entryPoint: 'vs' }, fragment: { module: blit, entryPoint: 'fs', targets: [{ format: this.format }] }, primitive: { topology: 'triangle-list' } }),
      };
      this.sampler = this.sampler || dev.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    }
    this.bind = null;
  }
  buf(name, data, usage) {
    const dev = this.device; this.bufs = this.bufs || {};
    const size = Math.max(16, Math.ceil(data.byteLength / 16) * 16);
    let b = this.bufs[name];
    if (!b || b.size < size) { if (b) b.destroy(); b = this.bufs[name] = dev.createBuffer({ size, usage: usage | GPUBufferUsage.COPY_DST }); this.bind = null; }
    dev.queue.writeBuffer(b, 0, data.buffer, data.byteOffset, data.byteLength);
    return b;
  }
  resize(w, h) {
    if (this.w === w && this.h === h && this.bufs && this.bufs.accum) return;
    this.w = w; this.h = h; this.canvas.width = w; this.canvas.height = h;
    const dev = this.device; this.bufs = this.bufs || {};
    for (const n of ['accum', 'aovA', 'aovN', 'tA', 'tB']) { if (this.bufs[n]) this.bufs[n].destroy(); this.bufs[n] = dev.createBuffer({ size: w * h * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST }); }
    if (this.outTex) this.outTex.destroy();
    this.outTex = dev.createTexture({ size: [w, h], format: 'rgba8unorm', usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC });
    this.bind = null;
  }
  upload(packed) {
    this.buf('uni', packed.U, GPUBufferUsage.STORAGE); this.buf('objs', packed.O, GPUBufferUsage.STORAGE);
    this.buf('lits', packed.LI, GPUBufferUsage.STORAGE); this.buf('bvh', packed.BV, GPUBufferUsage.STORAGE);
    this.uploadSD(packed);
  }
  // the scene data: a static head (mesh BVHs and triangles, face tables, the HDRI) written when it changes, and a
  // small dynamic tail (media, motion poses) written on every pack — so a pose update never re-sends geometry
  uploadSD(packed) {
    const dev = this.device, head = packed.SDs, tail = packed.SDd, base = packed.dynBase;
    const need = Math.max(16, (base * 4 + tail.length) * 4);
    let b = this.bufs.sd;
    const fresh = !b || b.size < need;
    if (fresh) { if (b) b.destroy(); b = this.bufs.sd = dev.createBuffer({ size: Math.ceil(need * (this._sdGrow ? 1.25 : 1) / 16) * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST }); this._sdGrow = true; this.bind = null; }
    if (fresh || this._sdHead !== head) { if (head.length) dev.queue.writeBuffer(b, 0, head.buffer, head.byteOffset, head.byteLength); this._sdHead = head; }
    if (tail.length) dev.queue.writeBuffer(b, base * 16, tail.buffer, tail.byteOffset, tail.byteLength);
    this.sdBytes = { head: head.byteLength, tail: tail.byteLength };
  }
  setUniforms(U) { this.buf('uni', U, GPUBufferUsage.STORAGE); }
  trace() {
    const dev = this.device, B = this.bufs;
    if (!this.bind) {
      const L = this.pipe.trace.getBindGroupLayout(0);
      const ent = [['uni', 0], ['objs', 1], ['lits', 2], ['bvh', 3], ['sd', 4], ['accum', 5], ['aovA', 6], ['aovN', 7]];
      this.bind = dev.createBindGroup({ layout: L, entries: ent.map(([n, b]) => ({ binding: b, resource: { buffer: B[n] } })) });
    }
    const enc = dev.createCommandEncoder();
    const pass = enc.beginComputePass(); pass.setPipeline(this.pipe.trace); pass.setBindGroup(0, this.bind);
    pass.dispatchWorkgroups(Math.ceil(this.w / 8), Math.ceil(this.h / 8)); pass.end();
    dev.queue.submit([enc.finish()]);
    this.inflight = (this.inflight || 0) + 1;
    dev.queue.onSubmittedWorkDone().then(() => { this.inflight--; }, () => { this.inflight = 0; });
  }
  // back-pressure: a slow GPU (or a heavy scene) must not queue frames faster than it finishes them
  busy() { return (this.inflight || 0) >= 2; }
  display(D, denoise) {
    const dev = this.device, B = this.bufs, P = this.post;
    const steps = denoise ? denoise.steps : 0;
    let src = B.accum;
    const sets = [];
    for (let k = 0; k < steps; k++) {
      const d = new Float32Array(D); d[1 * 4 + 3] = k === 0 ? 0 : 1; d[16] = 1 << k; d[17] = denoise.sigma / (1 << k);
      const ub = this.buf('dn' + k, d, GPUBufferUsage.STORAGE);
      const dst = k % 2 === 0 ? B.tA : B.tB;
      sets.push({ ub, src, dst }); src = dst;
    }
    const fin = new Float32Array(D); fin[1 * 4 + 3] = steps ? 1 : 0;
    const fb = this.buf('dfin', fin, GPUBufferUsage.STORAGE);
    const enc = dev.createCommandEncoder();
    for (const s of sets) {
      const bg = dev.createBindGroup({ layout: P.den.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: s.ub } }, { binding: 1, resource: { buffer: s.src } }, { binding: 2, resource: { buffer: B.aovA } }, { binding: 3, resource: { buffer: B.aovN } }, { binding: 4, resource: { buffer: s.dst } }] });
      const p = enc.beginComputePass(); p.setPipeline(P.den); p.setBindGroup(0, bg); p.dispatchWorkgroups(Math.ceil(this.w / 8), Math.ceil(this.h / 8)); p.end();
    }
    const bg = dev.createBindGroup({ layout: P.disp.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: fb } }, { binding: 1, resource: { buffer: src } }, { binding: 2, resource: { buffer: B.aovA } }, { binding: 3, resource: { buffer: B.aovN } }, { binding: 4, resource: this.outTex.createView() }] });
    const p = enc.beginComputePass(); p.setPipeline(P.disp); p.setBindGroup(0, bg); p.dispatchWorkgroups(Math.ceil(this.w / 8), Math.ceil(this.h / 8)); p.end();
    const view = this.ctx.getCurrentTexture().createView();
    const rp = enc.beginRenderPass({ colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
    rp.setPipeline(P.blit); rp.setBindGroup(0, dev.createBindGroup({ layout: P.blit.getBindGroupLayout(0), entries: [{ binding: 0, resource: this.outTex.createView() }, { binding: 1, resource: this.sampler }] }));
    rp.draw(3); rp.end();
    dev.queue.submit([enc.finish()]);
  }
  async readRGBA8() {
    const dev = this.device, w = this.w, h = this.h, bpr = Math.ceil(w * 4 / 256) * 256;
    const buf = dev.createBuffer({ size: bpr * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = dev.createCommandEncoder(); enc.copyTextureToBuffer({ texture: this.outTex }, { buffer: buf, bytesPerRow: bpr }, [w, h]); dev.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const src = new Uint8Array(buf.getMappedRange()), out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) out.set(src.subarray(y * bpr, y * bpr + w * 4), y * w * 4);
    buf.unmap(); buf.destroy();
    return new ImageData(out, w, h);
  }
  async readAccum() { return this.readBuf('accum'); }
  // the raw accumulation targets, row 0 at the top: 'accum' (colour, count), 'aovA' (albedo), 'aovN' (normal, depth)
  async readBuf(name) {
    const dev = this.device, size = this.w * this.h * 16;
    const buf = dev.createBuffer({ size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = dev.createCommandEncoder(); enc.copyBufferToBuffer(this.bufs[name], 0, buf, 0, size); dev.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ); const f = new Float32Array(buf.getMappedRange().slice(0)); buf.unmap(); buf.destroy();
    return f;
  }
  // keep / restore the accumulation around a one-off pass (the id pass) so a still render is not lost
  saveAccum() { const enc = this.device.createCommandEncoder(); enc.copyBufferToBuffer(this.bufs.accum, 0, this.bufs.tB, 0, this.w * this.h * 16); this.device.queue.submit([enc.finish()]); }
  restoreAccum() { const enc = this.device.createCommandEncoder(); enc.copyBufferToBuffer(this.bufs.tB, 0, this.bufs.accum, 0, this.w * this.h * 16); this.device.queue.submit([enc.finish()]); }
  async idle() { await this.device.queue.onSubmittedWorkDone(); }
  dispose() { try { for (const b of Object.values(this.bufs || {})) b.destroy(); this.device.destroy(); } catch (e) { /* gone */ } }
}

// ---------------- WebGL2 ----------------
const VS = `#version 300 es
in vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
export class GLRenderer {
  static create(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true, alpha: false, powerPreference: 'high-performance' });
    if (!gl) return null;
    if (!gl.getExtension('EXT_color_buffer_float')) return null;
    const r = new GLRenderer(); r.gl = gl; r.canvas = canvas; r.name = 'WebGL2';
    const dbg = gl.getExtension('WEBGL_debug_renderer_info'); r.info = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    r.cache = new Map();
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); r.vb = vb;
    r.tex = {}; r.lost = false; canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); r.lost = true; });
    return r;
  }
  program(fs, label) {
    const gl = this.gl;
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) { const log = gl.getShaderInfoLog(x) || 'compile failed'; const e = new Error(`GLSL (${label}): ` + log.split('\n').slice(0, 4).join(' ')); e.source = s; e.shaderErrors = log.split('\n').filter(Boolean).map(l => { const m = l.match(/0:(\d+):\s*(.*)/); return m ? { line: +m[1], message: m[2] } : { line: 0, message: l }; }); throw e; } return x; };
    const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`GLSL link (${label}): ` + gl.getProgramInfoLog(p));
    const uniforms = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); uniforms[a.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, a.name); }
    return { p, u: uniforms };
  }
  prelude(nU) {
    return `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
uniform vec4 uU[${nU}];
uniform sampler2D tObj; uniform sampler2D tLit; uniform sampler2D tBvh; uniform sampler2D tSD;
uniform sampler2D tPC; uniform sampler2D tPA; uniform sampler2D tPN;
layout(location = 0) out vec4 oC; layout(location = 1) out vec4 oA; layout(location = 2) out vec4 oN;
vec4 U(int i) { return uU[i]; }
vec4 objF(int i) { return texelFetch(tObj, ivec2(i & 1023, i >> 10), 0); }
vec4 litF(int i) { return texelFetch(tLit, ivec2(i & 1023, i >> 10), 0); }
vec4 bvhF(int i) { return texelFetch(tBvh, ivec2(i & 1023, i >> 10), 0); }
vec4 sdF(int i) { return texelFetch(tSD, ivec2(i & 1023, i >> 10), 0); }
`;
  }
  async compile(compiled, dispSrc) {
    const gl = this.gl;
    const key = compiled.shared;
    let pipe = this.cache.get(key);
    if (!pipe) {
      const glsl = wgslToGlsl(compiled.shared);
      const fs = this.prelude(compiled.nU) + glsl + `
void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  vec2 res = U(0).xy;
  vec2 px = vec2(float(ip.x), res.y - 1.0 - float(ip.y));
  PixOut o = renderPixel(px, uint(U(0).z));
  if (U(0).z < 0.5) { oC = o.c; oA = o.alb; oN = o.nrm; }
  else { oC = texelFetch(tPC, ip, 0) + o.c; oA = texelFetch(tPA, ip, 0) + o.alb; oN = texelFetch(tPN, ip, 0) + o.nrm; }
}`;
      pipe = Object.assign(this.program(fs, 'path tracer'), { code: fs, nU: compiled.nU });
      this.cache.set(key, pipe);
      if (this.cache.size > 16) { const k = this.cache.keys().next().value; gl.deleteProgram(this.cache.get(k).p); this.cache.delete(k); }
    }
    this.pipe = pipe; this.source = pipe.code;
    if (!this.post || this.post.key !== dispSrc) {
      const pre = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
uniform vec4 uD[32];
uniform sampler2D tSrc; uniform sampler2D tA; uniform sampler2D tN;
out vec4 outC;
vec4 D(int i) { return uD[i]; }
float sq(float x) { return x * x; }
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 safeNorm(vec3 v) { float l = length(v); return l > 1e-20 ? v / l : vec3(0.0, 1.0, 0.0); }
vec3 cAt(ivec2 p) { vec4 v = texelFetch(tSrc, p, 0); return v.xyz / max(v.w, 1.0); }
vec3 aAt(ivec2 p) { return texelFetch(tA, p, 0).xyz / max(D(0).z, 1.0); }
vec4 nAt(ivec2 p) { vec4 n = texelFetch(tN, p, 0) / max(D(0).z, 1.0); return vec4(safeNorm(n.xyz), n.w); }
`;
      const body = wgslToGlsl(dispSrc);
      const den = this.program(pre + body + `
void main() { ivec2 res = ivec2(int(D(0).x), int(D(0).y)); ivec2 p = ivec2(gl_FragCoord.xy); outC = vec4(denoisePx(p, int(D(4).x), res, D(4).y, D(0).w), 1.0); }`, 'denoise');
      const disp = this.program(pre + body + `
void main() { ivec2 res = ivec2(int(D(0).x), int(D(0).y)); ivec2 q = ivec2(gl_FragCoord.xy); outC = displayPx(ivec2(q.x, q.y), res); }`, 'display');
      this.post = { key: dispSrc, den, disp };
    }
  }
  dataTex(name, data) {
    const gl = this.gl, n = Math.max(1, data.length / 4), w = Math.min(1024, n), h = Math.ceil(n / 1024);
    const arr = new Float32Array(w * h * 4); arr.set(data.subarray(0, Math.min(data.length, arr.length)));
    let t = this.tex[name]; if (!t) { t = this.tex[name] = gl.createTexture(); }
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, arr);
  }
  target(w, h, n) {
    const gl = this.gl;
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    const texs = [];
    for (let i = 0; i < n; i++) {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0); texs.push(t);
    }
    gl.drawBuffers(texs.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
    return { fb, texs };
  }
  resize(w, h) {
    if (this.w === w && this.h === h && this.acc) return;
    const gl = this.gl; this.w = w; this.h = h; this.canvas.width = w; this.canvas.height = h;
    const kill = t => { if (!t) return; gl.deleteFramebuffer(t.fb); t.texs.forEach(x => gl.deleteTexture(x)); };
    if (this.acc) { kill(this.acc[0]); kill(this.acc[1]); kill(this.dn[0]); kill(this.dn[1]); }
    this.acc = [this.target(w, h, 3), this.target(w, h, 3)]; this.dn = [this.target(w, h, 1), this.target(w, h, 1)]; this.cur = 0;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  upload(packed) { this.dataTex('obj', packed.O); this.dataTex('lit', packed.LI); this.dataTex('bvh', packed.BV); this.uploadSD(packed); this.U = packed.U; }
  // one RGBA32F texture, 1024 texels wide: the static head re-sent only when it changes, the dynamic tail (whole rows
  // from dynBase, which is row-aligned) with texSubImage2D
  uploadSD(packed) {
    const gl = this.gl, head = packed.SDs, tail = packed.SDd, base = packed.dynBase;
    const rows = Math.max(1, Math.ceil((base + tail.length / 4) / 1024));
    const max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    if (rows > max) throw new Error(`scene data needs ${rows} texture rows; this GPU allows ${max} (too many triangles for WebGL2 here — try WebGPU)`);
    let t = this.tex.sd;
    const fresh = !t || this._sdRows < rows;
    if (fresh || this._sdHead !== head) {
      if (!t) t = this.tex.sd = gl.createTexture();
      const all = new Float32Array(1024 * rows * 4); all.set(head); all.set(tail, base * 4);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1024, rows, 0, gl.RGBA, gl.FLOAT, all);
      this._sdRows = rows; this._sdHead = head;
    } else if (tail.length) {
      const r0 = base / 1024, nr = Math.ceil(tail.length / 4 / 1024);
      const buf = new Float32Array(nr * 1024 * 4); buf.set(tail);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, r0, 1024, nr, gl.RGBA, gl.FLOAT, buf);
    }
    this.sdBytes = { head: head.byteLength, tail: tail.byteLength };
  }
  setUniforms(U) { this.U = U; }
  bindTex(prog, name, unit, tex) { const gl = this.gl; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); if (prog.u[name]) gl.uniform1i(prog.u[name], unit); }
  quad() { const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, this.vb); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLES, 0, 3); }
  trace() {
    const gl = this.gl, P = this.pipe, src = this.acc[this.cur], dst = this.acc[1 - this.cur];
    gl.useProgram(P.p); gl.uniform4fv(P.u.uU, this.U.subarray(0, P.nU * 4));
    this.bindTex(P, 'tObj', 0, this.tex.obj); this.bindTex(P, 'tLit', 1, this.tex.lit); this.bindTex(P, 'tBvh', 2, this.tex.bvh); this.bindTex(P, 'tSD', 3, this.tex.sd);
    this.bindTex(P, 'tPC', 4, src.texs[0]); this.bindTex(P, 'tPA', 5, src.texs[1]); this.bindTex(P, 'tPN', 6, src.texs[2]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb); gl.viewport(0, 0, this.w, this.h); this.quad();
    this.cur = 1 - this.cur;
    if (!this.fence) this.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  }
  display(D, denoise) {
    const gl = this.gl, A = this.acc[this.cur], P = this.post;
    let src = A.texs[0];
    const steps = denoise ? denoise.steps : 0;
    for (let k = 0; k < steps; k++) {
      const d = new Float32Array(D); d[7] = k === 0 ? 0 : 1; d[16] = 1 << k; d[17] = denoise.sigma / (1 << k);
      gl.useProgram(P.den.p); gl.uniform4fv(P.den.u.uD, d);
      this.bindTex(P.den, 'tSrc', 0, src); this.bindTex(P.den, 'tA', 1, A.texs[1]); this.bindTex(P.den, 'tN', 2, A.texs[2]);
      const dst = this.dn[k % 2]; gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb); gl.viewport(0, 0, this.w, this.h); this.quad();
      src = dst.texs[0];
    }
    const d = new Float32Array(D); d[7] = steps ? 1 : 0;
    gl.useProgram(P.disp.p); gl.uniform4fv(P.disp.u.uD, d);
    this.bindTex(P.disp, 'tSrc', 0, src); this.bindTex(P.disp, 'tA', 1, A.texs[1]); this.bindTex(P.disp, 'tN', 2, A.texs[2]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.w, this.h); this.quad();
  }
  async readRGBA8() {
    const gl = this.gl, w = this.w, h = this.h, px = new Uint8Array(w * h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) out.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    return new ImageData(out, w, h);
  }
  async readAccum() { return this.readBuf('accum'); }
  async readBuf(name) {
    const k = { accum: 0, aovA: 1, aovN: 2 }[name];
    const gl = this.gl, A = this.acc[this.cur], w = this.w, h = this.h, f = new Float32Array(w * h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, A.fb); gl.readBuffer(gl.COLOR_ATTACHMENT0 + k); gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, f);
    gl.readBuffer(gl.COLOR_ATTACHMENT0); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // flip rows so row 0 is the top, like the WebGPU buffer
    const out = new Float32Array(w * h * 4); for (let y = 0; y < h; y++) out.set(f.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    return out;
  }
  // the id pass writes into the other ping-pong target, so the accumulation survives: just don't flip
  saveAccum() { this._saved = this.cur; }
  restoreAccum() { if (this._saved != null) this.cur = this._saved; this._saved = null; }
  async idle() { this.gl.finish(); }
  // back-pressure through a fence after each trace: polled, never waited on
  busy() {
    const gl = this.gl; if (!this.fence) return false;
    const st = gl.getSyncParameter(this.fence, gl.SYNC_STATUS);
    if (st === gl.SIGNALED) { gl.deleteSync(this.fence); this.fence = null; return false; }
    return true;
  }
  dispose() { const e = this.gl.getExtension('WEBGL_lose_context'); if (e) e.loseContext(); }
}
