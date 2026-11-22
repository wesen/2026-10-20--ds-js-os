// isa.js: the single definition of section bytecode version 1 (PICOCALC-CANDELA-SECTIONS design, Section 5).
// The translator and the kernel generator (../kernel.mjs) import it; ../isa.mjs generates
// picocalc-os/third_party/candela/vm/cdl_vm_isa.h from it for the C verifier and interpreter.
// Pure JavaScript, QuickJS-compatible.
//
// An instruction is one opcode halfword (low byte: opcode, high byte: an immediate H) followed by operand
// halfwords. Operand specs, one per operand halfword:
//   dN / sN   destination / source register of N words (N = 1..4; L = 26-word Lobe, H = 23-word Hit)
//   xN        a register that is read and written (CHOOSE's u)
//   dw / sw   width taken from H & 7 (generic vector instructions)
//   sa sb sc  source of width (H & 7), or 1 word when broadcast bit 3/4/5 of H is set
//   t         forward jump target (halfword offset in the code)
//   i         immediate halfword, range checked per opcode by the verifier
//   h         a Hit operand: 0xFFFF for the material entry's input Hit, otherwise a 23-word source register
// Variable-length instructions (LOBE, SWITCH, CALL, GATHER, HLD, HBOOL) are described by `special`.

export const VERSION = 1;
export const MAGIC = 0x4d564443;          // 'CDVM'
export const MAX_REGS = 4096;
export const MAX_CODE = 65535;
export const HIT_IN = 0xffff;

export const HIT_WORDS = 23, LOBE_WORDS = 26;
// Word layout of the kernel's structs (kernel.js CORE `struct Hit`, `struct Lobe`; every member is 4 bytes,
// a bool is one byte padded to a word). The host test checks these against the pinned kernel's struct text.
export const HIT_FIELDS = {
  ok: [0, 1, 'bool'], t: [1, 1, 'f32'], P: [2, 3, 'vec3f'], N: [5, 3, 'vec3f'], Ng: [8, 3, 'vec3f'], uv: [11, 2, 'vec2f'],
  lp: [13, 3, 'vec3f'], obj: [16, 1, 'i32'], mat: [17, 1, 'i32'], lit: [18, 1, 'i32'], front: [19, 1, 'bool'],
  irand: [20, 1, 'f32'], iid: [21, 1, 'f32'], face: [22, 1, 'i32'],
};
export const LOBE_FIELDS = {
  kind: [0, 1, 'i32'], c0: [1, 3, 'vec3f'], c1: [4, 3, 'vec3f'], ax: [7, 1, 'f32'], ay: [8, 1, 'f32'], ior: [9, 1, 'f32'],
  flags: [10, 1, 'i32'], N: [11, 3, 'vec3f'], w: [14, 3, 'vec3f'], Le: [17, 3, 'vec3f'], film: [20, 2, 'vec2f'],
  med: [22, 1, 'i32'], T: [23, 3, 'vec3f'],
};
export const LOBE_ORDER = ['kind', 'c0', 'c1', 'ax', 'ay', 'ior', 'flags', 'N', 'w', 'Le', 'film', 'med', 'T'];
// lobeNone() (kernel.js CORE), as words: kind 0, c0 0, c1 0, ax 0, ay 0, ior 1.5, flags 0, N (0,1,0), w (1,1,1),
// Le 0, film (0, 1.33), med -1, T 0. Integers are stored as int32 bit patterns.
export const LOBE_NONE = [['i', 0], 0, 0, 0, 0, 0, 0, 0, 0, 1.5, ['i', 0], 0, 1, 0, 1, 1, 1, 0, 0, 0, 0, 1.33, ['i', -1], 0, 0, 0];

// The five entries, in descriptor order: name, argument words, result words, argument layout.
export const ENTRIES = [
  { name: 'evalMaterial', args: [['wo', 'vec3f'], ['u', 'f32']], ret: 'Lobe', hitParam: 'h' },
  { name: 'sdUser', args: [['k', 'i32'], ['p', 'vec3f']], ret: 'f32' },
  { name: 'heightAt', args: [['k', 'i32'], ['xz', 'vec2f']], ret: 'f32' },
  { name: 'densityOf', args: [['m', 'i32'], ['P', 'vec3f']], ret: 'f32' },
  { name: 'customKernel', args: [['ro', 'vec3f'], ['rd', 'vec3f']], ret: 'vec3f' },
];

// Kernel functions reached through cdl_vm_kernel (design Section 7.2). sig: operands after the CALL opcode
// halfword (whose H is the function number). `custom`: allowed only in the customKernel entry.
// `effects`: the function changes the kernel's module state (PICOCALC-CANDELA-CPU-KERNEL manifest.json, kernel.sideEffects:
// traceScene, occluded, rnd, rnd2; cosHemiN draws rnd2). Such calls are never removed, merged or reordered, and run in
// WGSL's left-to-right order (design Section 4.6). `api`: in the kernel's section API (manifest.json sectionAPI).
export const KFUNCS = [
  { name: 'fresnelDielectric', sig: ['d1', 's1', 's1'], api: true },
  { name: 'noise3', sig: ['d1', 's3'], api: true },
  { name: 'fbm3', sig: ['d1', 's3', 's1', 's1', 'i', 'i'], api: true },            // oct (<= 16) and mode (<= 2) are immediates
  { name: 'voronoi3', sig: ['d4', 's3'], api: true },
  { name: 'tangentWorld', sig: ['d3', 'h', 's3', 's1', 's3'], api: true },
  { name: 'sellmeier', sig: ['d1', 's1', 's3', 's3'], api: true },
  { name: 'traceScene', sig: ['dH', 's3', 's3', 's1'], custom: true, api: true, effects: true },
  { name: 'occluded', sig: ['d1', 's3', 's3', 's1'], custom: true, api: true, effects: true },
  { name: 'hitAlbedo', sig: ['d3', 'h', 's3'], custom: true, api: true },
  // beyond the section API: Candela's custom-integrator helpers; no preset's sections call them, and a kernel that
  // does not export them leaves them NULL (the translator refuses them unless opts.kernelApi names them)
  { name: 'hitEmission', sig: ['d3', 'h', 's3'], custom: true },
  { name: 'hash13', sig: ['d1', 's3'] },
  { name: 'voronoiVec3', sig: ['d3', 's3'] },
  { name: 'envSun', sig: ['d3', 's3'], custom: true },
  { name: 'rnd', sig: ['d1'], custom: true, effects: true },
  { name: 'rnd2', sig: ['d2'], custom: true, effects: true },
  { name: 'cosHemiN', sig: ['d3', 's3'], custom: true, effects: true },
];
// The kernel's section API and its functions with side effects, as kernel/manifest.json lists them (sectionAPI,
// kernel.sideEffects). SECTION_API is the one definition: ../kernel.mjs exports exactly these functions, in this order,
// from the generated kernel. It is the union of what the generated sections of all 105 presets of the pinned Candela
// call (PICOCALC-CANDELA-CPU-KERNEL scripts/01-section-api.mjs, 2026-11-21); a Candela version bump derives it again.
// lobeNone, lum, metalAt, safeNorm, fmodp and fmodp3 are translated into bytecode; the other nine are kernel calls.
export const SECTION_API = ['fbm3', 'fmodp', 'fmodp3', 'fresnelDielectric', 'hitAlbedo', 'lobeNone', 'lum', 'metalAt', 'noise3', 'occluded',
  'safeNorm', 'sellmeier', 'tangentWorld', 'traceScene', 'voronoi3'];
export const KERNEL_SIDE_EFFECTS = ['cameraRay', 'hitMesh', 'hitObj', 'neeAt', 'occluded', 'renderPixel', 'rnd', 'rnd2', 'shadowTr', 'traceAOV',
  'traceAll', 'tracePath', 'traceScene'];
for (const f of KFUNCS) {
  if (!!f.api !== SECTION_API.includes(f.name)) throw new Error('isa.js: api flag of ' + f.name + ' disagrees with SECTION_API');
  if (KERNEL_SIDE_EFFECTS.includes(f.name) && !f.effects) throw new Error('isa.js: ' + f.name + ' has side effects');
}
export const KFUNC = Object.fromEntries(KFUNCS.map((f, i) => [f.name, i]));

// Elementwise float operations: name -> [arity, C expression over a, b, c]. Scalar opcodes use the name as is;
// vec3 opcodes add '3'; the generic opcode adds a 'V' prefix and takes its width from H.
export const ELEM = {
  ADD: [2, 'a + b'], SUB: [2, 'a - b'], MUL: [2, 'a * b'], DIV: [2, 'a / b'],
  MIN: [2, 'fminf(a, b)'], MAX: [2, 'fmaxf(a, b)'], POW: [2, 'CDL_VM_POWF(a, b)'], ATAN2: [2, 'CDL_VM_ATAN2F(a, b)'],
  STEP: [2, '(b >= a ? 1.0f : 0.0f)'], FMODP: [2, '(a - b * CDL_VM_FLOORF(a / b))'],
  NEG: [1, '-a'], ABS: [1, 'fabsf(a)'], FLOOR: [1, 'CDL_VM_FLOORF(a)'], CEIL: [1, 'CDL_VM_CEILF(a)'], FRACT: [1, '(a - CDL_VM_FLOORF(a))'],
  SQRT: [1, 'sqrtf(a)'], SIN: [1, 'CDL_VM_SINF(a)'], COS: [1, 'CDL_VM_COSF(a)'], TAN: [1, 'CDL_VM_TANF(a)'],
  ASIN: [1, 'CDL_VM_ASINF(a)'], ACOS: [1, 'CDL_VM_ACOSF(a)'], ATAN: [1, 'CDL_VM_ATANF(a)'], EXP: [1, 'CDL_VM_EXPF(a)'],
  EXP2: [1, 'CDL_VM_EXP2F(a)'], LOG: [1, 'CDL_VM_LOGF(a)'], LOG2: [1, 'CDL_VM_LOG2F(a)'],
  SIGN: [1, '(a > 0.0f ? 1.0f : a < 0.0f ? -1.0f : 0.0f)'],
  CLAMP: [3, 'fminf(fmaxf(a, b), c)'], MIX: [3, '(a + (b - a) * c)'],
  SMOOTH: [3, 'cdl_vm_smooth(a, b, c)'],
};
// which elementwise operations get a dedicated vec3 opcode (the rest use the generic form)
export const ELEM3 = ['ADD', 'SUB', 'MUL', 'DIV', 'MIN', 'MAX', 'NEG', 'ABS', 'FLOOR', 'FRACT', 'CLAMP', 'MIX'];

const ops = [];
const op = (name, sig, extra = {}) => ops.push(Object.assign({ name, sig }, extra));
// control
op('RET', [], { term: true });
op('JMP', ['t'], { term: true });
op('BRZ', ['s1', 't']);
op('BRNZ', ['s1', 't']);
op('IFLT', ['s1', 's1', 't']);                      // jump to t unless a < b
op('CHOOSE', ['x1', 's1', 't']);                    // stochastic selection with rescaling of u
op('CHOOSE0', ['s1', 's1', 't']);                   // the same test without rescaling
op('SWITCH', null, { special: 'switch' });          // s1 n t0..tn-1 tdefault
// moves and inputs
op('MOV1', ['d1', 's1']); op('MOV2', ['d2', 's2']); op('MOV3', ['d3', 's3']); op('MOV4', ['d4', 's4']);
op('MOVN', ['dw', 'sw'], { wide: true });           // H = width (1..26)
op('SPLAT3', ['d3', 's1']);
op('GATHER', null, { special: 'gather' });          // H = n; d(n) s pattern(i): 2 bits per component
op('HLD', null, { special: 'hld' });                // H = n; d(n) off(i): n words of the input Hit at off
op('HBOOL', null, { special: 'hbool' });            // d1 s(hit) off(i): a bool byte of a register-held Hit
op('GLD', ['d1'], { special: 'gld' });              // H = 0 gTime, 1 gLam
op('LNONE', ['dL']);
op('LOBE', null, { special: 'lobe' });              // base(dL) mask(i) then one source per set bit
// scalar float
for (const [k, [n]] of Object.entries(ELEM)) op(k, ['d1', ...Array(n).fill('s1')]);
op('FLT', ['d1', 's1', 's1']); op('FLE', ['d1', 's1', 's1']); op('FGT', ['d1', 's1', 's1']); op('FGE', ['d1', 's1', 's1']);
op('FEQ', ['d1', 's1', 's1']); op('FNE', ['d1', 's1', 's1']);
op('SEL', ['d1', 's1', 's1', 's1']);                // d = c ? t : f; operands c t f
// vec3
for (const k of ELEM3) op(k + '3', ['d3', ...Array(ELEM[k][0]).fill('s3')]);
op('ADD3S', ['d3', 's3', 's1']); op('SUB3S', ['d3', 's3', 's1']); op('MUL3S', ['d3', 's3', 's1']); op('DIV3S', ['d3', 's3', 's1']);
op('SSUB3', ['d3', 's1', 's3']); op('SDIV3', ['d3', 's1', 's3']); op('SMUL3', ['d3', 's1', 's3']); op('SADD3', ['d3', 's1', 's3']);
op('MIX3S', ['d3', 's3', 's3', 's1']);
op('DOT3', ['d1', 's3', 's3']); op('CROSS', ['d3', 's3', 's3']); op('LEN3', ['d1', 's3']);
op('NORM3', ['d3', 's3']); op('SAFENORM3', ['d3', 's3']);
op('SEL3', ['d3', 's1', 's3', 's3']);
// generic vector (width H & 7 = 1..4, broadcast bits 3, 4, 5 for operands a, b, c)
for (const [k, [n]] of Object.entries(ELEM)) op('V' + k, ['dw', ...['sa', 'sb', 'sc'].slice(0, n)], { generic: true });
op('VSEL', ['dw', 's1', 'sw', 'sw'], { generic: true });
op('VDOT', ['d1', 'sw', 'sw'], { generic: true });
op('VLEN', ['d1', 'sw'], { generic: true });
op('VNORM', ['dw', 'sw'], { generic: true });
op('VSAFENORM', ['dw', 'sw'], { generic: true });
// integer and boolean (words as int32)
for (const k of ['IADD', 'ISUB', 'IMUL', 'IOR', 'IAND', 'IXOR', 'IEQ', 'INE', 'ILT', 'ILE', 'IGT', 'IGE', 'AND', 'OR']) op(k, ['d1', 's1', 's1']);
op('NOT', ['d1', 's1']); op('INEG', ['d1', 's1']); op('ITOF', ['d1', 's1']); op('FTOI', ['d1', 's1']);
// kernel calls and fused forms
op('CALL', null, { special: 'call' });              // H = function number; operands from KFUNCS[H].sig
op('FRESDOT', ['d1', 's3', 's3', 's1']);            // fresnelDielectric(clamp(dot(a, b), 0, 1), eta)
op('STRIPES', ['d1', 's1', 's1', 's1']);            // step(duty, fract(x * n)); operands x n duty
op('CHECKER', ['d1', 'sw', 'sw'], { generic: true });   // fmodp(floor(p * n).x + floor(p * n).y, 2); H = width of p
op('MAD', ['d1', 's1', 's1', 's1']);                // a * b + c, unfused (two roundings, as the compiled C on the host)
op('MAD3S', ['d3', 's3', 's1', 's3']);              // a * s + c

export const OPS = ops.map((o, i) => Object.assign(o, { code: i }));
export const OP = Object.fromEntries(OPS.map(o => [o.name, o]));
if (OPS.length > 255) throw new Error('isa.js: too many opcodes');

// Generic-instruction H byte: width w (1..4) and broadcast flags.
export const genH = (w, ba = false, bb = false, bc = false) => w | (ba ? 8 : 0) | (bb ? 16 : 0) | (bc ? 32 : 0);
