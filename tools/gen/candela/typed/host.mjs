// host.mjs: the Typed Candela kernel off the device (PICOCALC-CANDELA-TYPED): its WebAssembly build in Node and its
// RV32 build on the reference interpreter (bench/host/rv32-interp.js), over the same memory image, so the two can be
// compared pixel for pixel and their frame and accumulation digests computed as the gallery's renderer core does
// (firmware/nucleus/candela_gallery.c: FNV-1a over each pixel's 48-byte cdl_pixout, over the w x h vec4 accumulation).
//
//   const k = await TypedKernel.create(source, 'wasm' | 'rv32', { policy })
//   k.bind(scene)                      scene: { index, spectral, bin } (bin: Candela's packed blob, as exportScene)
//   k.span(y, x0, x1, frame)           -> Float32Array of 12 floats per pixel
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
export const MEMORY_BYTES = 1 << 20;
const ARENA = 4096, MAX_SIDE = 160;

export function realm() {
  const ctx = createContext({});
  for (const f of ['compiler/typed/tape.js', 'compiler/typed/typed-wasm.js', 'compiler/typed/typed-rv32.js',
    'compiler/typed/typed-rv32-inline.js', 'compiler/typed/typed-rv32-loops.js', 'bench/host/rv32-interp.js'])
    runInContext(readFileSync(resolve(REPO, f), 'utf8'), ctx, { filename: f });
  return ctx;
}

export class TypedKernel {
  static async create(source, target, { policy = 'kernel', ctx = realm(), counts = false } = {}) {
    const k = new TypedKernel();
    k.target = target; k.ctx = ctx; k.counts = counts; k.instructions = 0;
    if (target === 'wasm') {
      const w = ctx.typedWasm.compile(source, { maxSourceLength: 1 << 22, memoryPages: MEMORY_BYTES >> 16 });
      k.wasm = (await WebAssembly.instantiate(w.bytes)).instance.exports;
      k.mem = new Uint8Array(k.wasm.memory.buffer);
    } else {
      const t0 = Date.now();
      k.program = ctx.typedRv32.compile(source, [], 1 << 22, { policy });
      k.compileMs = Date.now() - t0;
      k.mem = new Uint8Array(MEMORY_BYTES);
    }
    k.view = new DataView(k.mem.buffer, k.mem.byteOffset, k.mem.byteLength);
    k.layout();
    return k;
  }
  call(name, args) {
    if (this.target === 'wasm') return this.wasm[name](...args);
    const r = this.ctx.typedRv32Interp.run(this.program, name, args, this.mem, { counts: this.counts, limit: 4e9, stackBytes: 1 << 16 });
    if (r.trap) throw new Error(name + ' trapped');
    this.mem.set(r.bytes);
    if (r.steps) this.instructions += r.steps;
    return r.registers[10];
  }
  // a buffer: capacity (UTF-16 units) at byte 0, data from byte 4
  buffer(at, units) { this.view.setInt32(at, units, true); return at; }
  layout() {
    const v = this.view;
    this.mem.fill(0);
    const lay = this.buffer(this.alloc0 = 256, 1024);
    const n = this.call('cdlLayout', [lay]);
    const cell = i => v.getUint16(lay + 4 + 2 * i, true);
    const words = cell(0) | (cell(1) << 16), np = cell(2), nb = cell(3);
    this.arena = ARENA; this.arenaWords = words;
    for (let i = 0; i < np; i++) v.setInt32(ARENA + 4 * cell(4 + 2 * i), ARENA + 4 * cell(5 + 2 * i), true);
    for (let i = 0; i < nb; i++) v.setInt32(ARENA + 4 * cell(4 + 2 * np + 2 * i), cell(5 + 2 * np + 2 * i), true);
    this.top = ARENA + 4 * words;
    this.out = this.top; this.buffer(this.out, 2 * 12 * MAX_SIDE); this.top += 4 + 48 * MAX_SIDE;
    this.rows = this.top;
    if (this.call('cdlInit', [ARENA]) !== 1) throw new Error('cdlInit');
    this.cells = n;
  }
  // bind a scene: its five row buffers into K's first five fields, the scene index and spectral flag, the sky table
  bind(scene) {
    const v = this.view, bin = scene.bin;
    const head = new Uint32Array(bin.buffer.slice(bin.byteOffset, bin.byteOffset + 24));
    if (head[0] !== 0x314c4443) throw new Error('packed blob magic');
    let at = this.rows, src = 24;
    for (let b = 0; b < 5; b++) {
      const rows = head[1 + b];
      this.buffer(at, 8 * rows);
      this.mem.set(bin.subarray(src, src + 16 * rows), at + 4);
      v.setInt32(ARENA + 4 * b, at, true);
      at += 4 + 16 * rows; src += 16 * rows;
    }
    if (at > MEMORY_BYTES - 65536) throw new Error('scene does not fit');
    v.setInt32(ARENA + 4 * 7, scene.index, true);
    v.setInt32(ARENA + 4 * 8, scene.spectral ? 1 : 0, true);
    v.setInt32(ARENA + 4 * 9, 0, true);
    this.call('cdlSky', [ARENA]);
    v.setInt32(ARENA + 4 * 9, 1, true);
  }
  span(y, x0, x1, frame) {
    this.call('cdlRenderSpan', [ARENA, this.out, y, x0, x1, frame]);
    return new Float32Array(this.mem.buffer.slice(this.mem.byteOffset + this.out + 4, this.mem.byteOffset + this.out + 4 + 48 * (x1 - x0)));
  }
}

export function fnv(h, bytes) {
  for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 16777619) >>> 0;
  return h >>> 0;
}
export const hex = h => (h >>> 0).toString(16).padStart(8, '0');

// Render `passes` passes of a w x h scene as the gallery does (pass p at Candela's frame index 0, then p + 1; per pixel
// the f32 sum of colour and count). Returns { frame0, acc, accBytes, pixouts? } with digests as hex.
export function render(k, w, h, passes, { onRow, keep } = {}) {
  const acc = new Float32Array(w * h * 4);
  let f0 = 2166136261;
  const all = keep ? [] : null;
  for (let p = 0; p < passes; p++) {
    const frame = p === 0 ? 0 : p + 1;
    for (let y = 0; y < h; y++) {
      const o = k.span(y, 0, w, frame);
      if (p === 0) f0 = fnv(f0, new Uint8Array(o.buffer));
      if (all) all.push(o);
      for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) { const i = 4 * (y * w + x) + c; acc[i] = Math.fround(acc[i] + o[12 * x + c]); }
      if (onRow) onRow(p, y, o);
    }
  }
  return { frame0: hex(f0), acc: hex(fnv(2166136261, new Uint8Array(acc.buffer))), accFloats: acc, pixouts: all };
}
