// The reference RV32IMF interpreter: the readable executor that runs next to the Typed compiler in any JavaScript VM,
// with per-instruction execution counts and calling-convention checks. docs/rv32-executors.md gives its role next to
// tools/trace-repl/pkg/tracerv32 (its Go twin) and bench/emu (rv32emu); bench/reference/rv32/vectors.jsonl is the conformance suite
// all three pass, with the RV32F expectations captured on the ESP32-P4.
//
// This is a classic script with no imports. It runs unchanged in Node (vm.runInThisContext or a plain <script>), in
// the trace REPL's goja sessions and in bare QuickJS, and defines globalThis.typedRv32Interp = {run, profile, classify}.
//
// It executes RV32IM, RV32F (with fcsr, its flags and all rounding modes) and the CSR instructions on fflags, frm and
// fcsr. It does not execute Espressif PIE instructions or ecall. With options.checks (the default) it checks, at
// every internal call and return, that the stack pointer is 16-byte aligned, that the return address is the one
// pushed by the call, and that sp, gp, tp and s0-s11 hold the values they had at the call: a call is jal or jalr
// linking ra, a return is `ret` (jalr x0, 0(ra)). A backend that keeps locals in callee-saved registers must pass
// these checks.
(() => {
"use strict";

const RETURN_TO_HOST = -4;
const CALLEE_SAVED = [2, 3, 4, 8, 9, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27];
const CALLER_SAVED = [5, 6, 7, 10, 11, 12, 13, 14, 15, 16, 17, 28, 29, 30, 31];
const EBREAK = 0x00100073, RET = 0x00008067;

class Rv32Fault extends Error {}

function fault(message, at) {
    throw new Rv32Fault(message + " at 0x" + (at >>> 0).toString(16));
}

// ---- RV32F: binary32 arithmetic on bit patterns, exact through BigInt, rounded once ----
const NX = 1, UF = 2, OF = 4, DZ = 8, NV = 16, NAN = 0x7fc00000, SIGN = 0x80000000;
let flags = 0; // the exception flags the current instruction raises
const isNaN32 = b => (b & 0x7fffffff) > 0x7f800000;
const isSNaN = b => isNaN32(b) && !(b & 0x400000);
const isInf = b => (b & 0x7fffffff) === 0x7f800000;
const isZero = b => (b & 0x7fffffff) === 0;
const sigOf = b => BigInt(b & 0x7f800000 ? (b & 0x7fffff) | 0x800000 : b & 0x7fffff);
const expOf = b => b & 0x7f800000 ? ((b >>> 23) & 255) - 150 : -149;
const bitLength = n => n.toString(2).length;
const signed0 = sign => sign ? SIGN : 0;
const invalid = () => { flags |= NV; return NAN; };
// NaN operands give the canonical NaN; a signaling one raises NV.
const nanOf = (...ops) => { if (ops.some(isSNaN)) flags |= NV; return NAN; };

// sig >> shift rounded with rm, for a value of the given sign; sticky: nonzero bits below sig. [result, inexact]
function shiftRound(sign, sig, shift, sticky, rm) {
    if (shift <= 0) {
        if (sticky) throw new Error("rv32-interp: rounding with too few guard bits");
        return [sig << BigInt(-shift), false];
    }
    const q = sig >> BigInt(shift), r = sig - (q << BigInt(shift)), half = 1n << BigInt(shift - 1);
    if (r === 0n && !sticky) return [q, false];
    const up = rm === 0 ? r > half || (r === half && (sticky || (q & 1n) === 1n)) :
        rm === 2 ? sign === 1 : rm === 3 ? sign === 0 : rm === 4 ? r >= half : false;
    return [up ? q + 1n : q, true];
}

// The binary32 nearest to (-1)^sign * sig * 2^exp (plus sticky) under rm, with NX, UF (tininess after rounding), OF.
function round(sign, sig, exp, sticky, rm) {
    const top = exp + bitLength(sig) - 1;
    let lsb = top - 23, tiny = false;
    if (top < -126) {
        tiny = top < -127 || shiftRound(sign, sig, lsb - exp, sticky, rm)[0] < 1n << 24n;
        lsb = -149;
    }
    let [q, inexact] = shiftRound(sign, sig, lsb - exp, sticky, rm);
    if (inexact) flags |= NX | (tiny ? UF : 0);
    if (q === 1n << 24n) { q >>= 1n; lsb++; }
    const m = Number(q);
    if (m < 0x800000) return ((sign << 31) | m) >>> 0;
    if (lsb + 150 >= 255) {
        flags |= OF | NX;
        const toInf = rm === 0 || rm === 4 || (rm === 2 && sign) || (rm === 3 && !sign);
        return ((sign << 31) | (toInf ? 0x7f800000 : 0x7f7fffff)) >>> 0;
    }
    return ((sign << 31) | ((lsb + 150) << 23) | (m - 0x800000)) >>> 0;
}

// sa * 2^ea + sb * 2^eb exactly, rounded; an exact zero is +0 (-0 when rounding down).
function sum(sa, ea, sb, eb, rm) {
    const e = Math.min(ea, eb), s = (sa << BigInt(ea - e)) + (sb << BigInt(eb - e));
    if (s === 0n) return signed0(rm === 2);
    return s < 0n ? round(1, -s, e, false, rm) : round(0, s, e, false, rm);
}
const signedSig = b => b & SIGN ? -sigOf(b) : sigOf(b);

function fadd(a, b, rm) {
    if (isNaN32(a) || isNaN32(b)) return nanOf(a, b);
    if (isInf(a)) return isInf(b) && (a ^ b) & SIGN ? invalid() : a;
    if (isInf(b)) return b;
    if (isZero(a) && isZero(b)) return (a & b & SIGN) ? SIGN : (a | b) & SIGN ? signed0(rm === 2) : 0;
    return sum(signedSig(a), expOf(a), signedSig(b), expOf(b), rm);
}

function fmul(a, b, rm) {
    if (isNaN32(a) || isNaN32(b)) return nanOf(a, b);
    const sign = (a ^ b) >>> 31;
    if (isInf(a) || isInf(b)) return isZero(a) || isZero(b) ? invalid() : ((sign << 31) | 0x7f800000) >>> 0;
    if (isZero(a) || isZero(b)) return signed0(sign);
    return round(sign, sigOf(a) * sigOf(b), expOf(a) + expOf(b), false, rm);
}

function fdiv(a, b, rm) {
    if (isNaN32(a) || isNaN32(b)) return nanOf(a, b);
    const sign = (a ^ b) >>> 31;
    if (isInf(a)) return isInf(b) ? invalid() : ((sign << 31) | 0x7f800000) >>> 0;
    if (isInf(b)) return signed0(sign);
    if (isZero(b)) {
        if (isZero(a)) return invalid();
        flags |= DZ;
        return ((sign << 31) | 0x7f800000) >>> 0;
    }
    if (isZero(a)) return signed0(sign);
    const n = sigOf(a) << 50n, d = sigOf(b), q = n / d;
    return round(sign, q, expOf(a) - expOf(b) - 50, q * d !== n, rm);
}

function isqrt(n) {
    if (n < 2n) return n;
    let x = 1n << BigInt((bitLength(n) >> 1) + 1);
    for (;;) { const y = (x + n / x) >> 1n; if (y >= x) return x; x = y; }
}

function fsqrt(a, rm) {
    if (isNaN32(a)) return nanOf(a);
    if (isZero(a)) return a;
    if (a & SIGN) return invalid();
    if (isInf(a)) return a;
    let s = sigOf(a), e = expOf(a);
    if (e & 1) { s <<= 1n; e--; }
    const n = s << 80n, r = isqrt(n);
    return round(0, r, (e - 80) / 2, r * r !== n, rm);
}

// (-1)^negP * a * b + (-1)^negC * c, rounded once (fmadd, fmsub, fnmsub, fnmadd).
function fma(a, b, c, negP, negC, rm) {
    if (isNaN32(a) || isNaN32(b)) return nanOf(a, b, c);
    if ((isInf(a) && isZero(b)) || (isZero(a) && isInf(b))) { if (isSNaN(c)) flags |= NV; return invalid(); }
    if (isNaN32(c)) return nanOf(c);
    const signP = ((a ^ b) >>> 31) ^ negP, cc = (c ^ (negC << 31)) >>> 0;
    if (isInf(a) || isInf(b)) return isInf(cc) && (cc >>> 31) !== signP ? invalid() : ((signP << 31) | 0x7f800000) >>> 0;
    if (isInf(cc)) return cc;
    if (isZero(a) || isZero(b)) return isZero(cc) ? (signP === cc >>> 31 ? signed0(signP) : signed0(rm === 2)) : cc;
    const p = sigOf(a) * sigOf(b);
    return sum(signP ? -p : p, expOf(a) + expOf(b), signedSig(cc), expOf(cc), rm);
}

// -0 < +0; neither operand is a NaN.
const order = b => b & SIGN ? -(b & 0x7fffffff) - 1 : b;
function fminmax(a, b, max) {
    if (isSNaN(a) || isSNaN(b)) flags |= NV;
    if (isNaN32(a)) return isNaN32(b) ? NAN : b;
    if (isNaN32(b)) return a;
    return (order(a) < order(b)) === max ? b : a;
}

const f32 = new Float32Array(1), f32bits = new Uint32Array(f32.buffer);
const valueOf = b => { f32bits[0] = b; return f32[0]; };
function fcompare(a, b, f3) { // fle (0), flt (1), feq (2)
    if (isNaN32(a) || isNaN32(b)) {
        if (f3 !== 2 || isSNaN(a) || isSNaN(b)) flags |= NV;
        return 0;
    }
    const x = valueOf(a), y = valueOf(b);
    return Number(f3 === 2 ? x === y : f3 === 1 ? x < y : x <= y);
}

function fclass(a) {
    const sign = a >>> 31, e = (a >>> 23) & 255, m = a & 0x7fffff;
    if (e === 255) return m ? (m & 0x400000 ? 1 << 9 : 1 << 8) : sign ? 1 : 1 << 7;
    if (e === 0) return m ? (sign ? 1 << 2 : 1 << 5) : sign ? 1 << 3 : 1 << 4;
    return sign ? 1 << 1 : 1 << 6;
}

// fcvt.w.s and fcvt.wu.s: out of range (after rounding) and NaN saturate with NV alone.
function toInt(a, rm, unsigned) {
    const sign = a >>> 31;
    const saturated = () => { flags |= NV; return unsigned ? (sign && !isNaN32(a) ? 0 : -1) : (sign && !isNaN32(a) ? -0x80000000 : 0x7fffffff); };
    if (isNaN32(a) || isInf(a)) return saturated();
    if (isZero(a)) return 0;
    const [q, inexact] = shiftRound(sign, sigOf(a), -expOf(a), false, rm);
    const v = sign ? -q : q;
    if (unsigned ? v < 0n || v > 0xffffffffn : v < -0x80000000n || v > 0x7fffffffn) return saturated();
    if (inexact) flags |= NX;
    return Number(BigInt.asIntN(32, v));
}

function fromInt(v, rm, unsigned) {
    if (v === 0) return 0;
    const sign = !unsigned && v < 0 ? 1 : 0;
    return round(sign, BigInt(unsigned ? v >>> 0 : Math.abs(v)), 0, false, rm);
}

// program: the object returned by typedRv32.compile (image, entries, relocations, imports).
// memoryBytes: initial guest memory; the stack is placed above it.
// options: {stackBytes = 65536, limit = 50e6, imports = [], handlers = {}, counts = true, checks = true,
//           registers, fregisters, fcsr = 0}. registers (32 values) replaces the initial x registers the
//           interpreter otherwise sets up (callee-saved patterns, sp at the top of memory, ra, args in a0...);
//           fregisters (32 bit patterns) and fcsr set the floating-point state. checks: false turns the
//           calling-convention checks off (the conformance suite runs single instructions with them off).
function run(program, entry, args, memoryBytes, options = {}) {
    const image = program.image;
    const code = new DataView(image.buffer, image.byteOffset, image.byteLength);
    const words = image.byteLength >>> 2;
    const stackBytes = options.stackBytes ?? 65536;
    const limit = options.limit ?? 50e6;
    const size = (memoryBytes.length + stackBytes + 15) & -16;
    const bytes = new Uint8Array(size);
    bytes.set(memoryBytes);
    const memory = new DataView(bytes.buffer);
    const counts = options.counts === false ? null : new Uint32Array(words);
    const relocations = new Map((program.relocations ?? []).map(r => [r.offset, r.index]));
    const checks = options.checks !== false;
    const x = new Int32Array(32);
    if (options.registers) x.set(options.registers);
    else {
        for (const reg of CALLEE_SAVED) x[reg] = 0x12340000 + reg;
        x[2] = size;
        x[1] = RETURN_TO_HOST;
        for (let i = 0; i < args.length; i++) x[10 + i] = args[i];
    }
    x[0] = 0;
    const f = new Uint32Array(32);
    if (options.fregisters) f.set(options.fregisters);
    let fcsr = (options.fcsr ?? 0) & 0xff;
    const frames = [{pc: RETURN_TO_HOST, saved: CALLEE_SAVED.map(r => x[r])}];
    let at = program.entries[entry];
    if (at === undefined) throw new Error("unknown RV32 entry " + entry);
    let steps = 0;
    const signed12 = n => (n << 20) >> 20;
    const check = (address, width) => {
        if (address < 0 || address + width > size) fault("memory access outside guest memory: " + address, at);
    };
    const call = target => {
        if (x[2] & 15) fault("unaligned sp at internal call", at);
        frames.push({pc: target, saved: CALLEE_SAVED.map(r => x[r])});
    };
    // The rounding mode of an F instruction: its rm field, or frm for rm = 7; 5, 6 and an invalid frm are illegal.
    const rounding = rm => {
        const mode = rm === 7 ? fcsr >> 5 : rm;
        if (mode > 4) fault("unsupported F instruction", at);
        return mode;
    };
    const result = () => ({bytes: bytes.subarray(0, memoryBytes.length), registers: x, fregisters: f, fcsr});
    while (at !== RETURN_TO_HOST) {
        if (++steps > limit) fault("instruction limit " + limit + " reached", at);
        if (at < 0 || at >= image.byteLength || at & 3) fault("instruction address outside program", at);
        const w = code.getUint32(at, true);
        if (counts) counts[at >>> 2]++;
        const op = w & 0x7f, rd = (w >>> 7) & 31, f3 = (w >>> 12) & 7, f7 = w >>> 25;
        const rs1 = (w >>> 15) & 31, rs2 = (w >>> 20) & 31;
        const a = x[rs1], b = x[rs2], imm = w >> 20;
        let next = at + 4;
        if (relocations.has(at)) {
            const fn = (options.imports ?? [])[relocations.get(at)];
            const handler = fn && options.handlers?.[fn.name];
            if (!handler) fault("no handler for import " + relocations.get(at), at);
            if (x[2] & 15) fault("unaligned sp at import call", at);
            const value = handler(...x.slice(10, 10 + fn.params.length));
            for (const reg of CALLER_SAVED) x[reg] = 0x76540000 + reg;
            x[1] = next;
            x[10] = value | 0;
        } else if (w === EBREAK) {
            return {trap: true, at, steps, counts, ...result()};
        } else switch (op) {
        case 0x03: { // loads
            const address = a + imm;
            if (f3 === 0) { check(address, 1); x[rd] = memory.getInt8(address); }
            else if (f3 === 1) { check(address, 2); x[rd] = memory.getInt16(address, true); }
            else if (f3 === 2) { check(address, 4); x[rd] = memory.getInt32(address, true); }
            else if (f3 === 4) { check(address, 1); x[rd] = memory.getUint8(address); }
            else if (f3 === 5) { check(address, 2); x[rd] = memory.getUint16(address, true); }
            else fault("unsupported load", at);
            break;
        }
        case 0x23: { // stores
            const address = a + signed12((f7 << 5) | rd);
            if (f3 === 0) { check(address, 1); memory.setUint8(address, b & 255); }
            else if (f3 === 1) { check(address, 2); memory.setUint16(address, b & 65535, true); }
            else if (f3 === 2) { check(address, 4); memory.setInt32(address, b, true); }
            else fault("unsupported store", at);
            break;
        }
        case 0x13: { // immediate ALU
            const shamt = imm & 31;
            if (f3 === 0) x[rd] = a + imm;
            else if (f3 === 1) x[rd] = a << shamt;
            else if (f3 === 2) x[rd] = Number(a < imm);
            else if (f3 === 3) x[rd] = Number((a >>> 0) < (imm >>> 0));
            else if (f3 === 4) x[rd] = a ^ imm;
            else if (f3 === 5) x[rd] = f7 & 0x20 ? a >> shamt : a >>> shamt;
            else if (f3 === 6) x[rd] = a | imm;
            else x[rd] = a & imm;
            break;
        }
        case 0x33: { // register ALU and M extension
            if (f7 === 1) {
                if (f3 === 0) x[rd] = Math.imul(a, b);
                else if (f3 === 1) x[rd] = Number((BigInt(a) * BigInt(b)) >> 32n); // mulh
                else if (f3 === 2) x[rd] = Number((BigInt(a) * BigInt(b >>> 0)) >> 32n); // mulhsu
                else if (f3 === 3) x[rd] = Number((BigInt(a >>> 0) * BigInt(b >>> 0)) >> 32n) | 0; // mulhu
                else if (f3 === 4) x[rd] = b === 0 ? -1 : (a === -2147483648 && b === -1 ? a : a / b);
                else if (f3 === 5) x[rd] = b === 0 ? -1 : (a >>> 0) / (b >>> 0); // divu
                else if (f3 === 6) x[rd] = b === 0 ? a : (a === -2147483648 && b === -1 ? 0 : a % b);
                else x[rd] = b === 0 ? a : (a >>> 0) % (b >>> 0); // remu
            } else if (f3 === 0) x[rd] = f7 === 0x20 ? a - b : a + b;
            else if (f3 === 1) x[rd] = a << (b & 31);
            else if (f3 === 2) x[rd] = Number(a < b);
            else if (f3 === 3) x[rd] = Number((a >>> 0) < (b >>> 0));
            else if (f3 === 4) x[rd] = a ^ b;
            else if (f3 === 5) x[rd] = f7 === 0x20 ? a >> (b & 31) : a >>> (b & 31);
            else if (f3 === 6) x[rd] = a | b;
            else x[rd] = a & b;
            break;
        }
        case 0x37: x[rd] = w & 0xfffff000; break; // lui
        case 0x17: x[rd] = at + (w & 0xfffff000); break; // auipc
        case 0x63: { // branches
            const offset = ((w >> 31) << 12) | (((w >>> 7) & 1) << 11) | (((w >>> 25) & 63) << 5) | (((w >>> 8) & 15) << 1);
            let take;
            if (f3 === 0) take = a === b;
            else if (f3 === 1) take = a !== b;
            else if (f3 === 4) take = a < b;
            else if (f3 === 5) take = a >= b;
            else if (f3 === 6) take = (a >>> 0) < (b >>> 0);
            else if (f3 === 7) take = (a >>> 0) >= (b >>> 0);
            else fault("unsupported branch", at);
            if (take) next = at + offset;
            break;
        }
        case 0x6f: { // jal
            const offset = ((w >> 31) << 20) | (w & 0xff000) | (((w >>> 20) & 1) << 11) | (((w >>> 21) & 0x3ff) << 1);
            if (rd === 1 && checks) call(next);
            if (rd) x[rd] = next;
            next = at + offset;
            break;
        }
        case 0x67: { // jalr: `ret` returns from a checked call, jalr linking ra makes one
            if (f3 !== 0) fault("unsupported jalr", at);
            const target = (a + imm) & -2;
            if (w === RET && checks) {
                const frame = frames.pop();
                if (!frame || target !== frame.pc) fault("return address does not match the call", at);
                for (let i = 0; i < CALLEE_SAVED.length; i++) {
                    if (x[CALLEE_SAVED[i]] !== frame.saved[i])
                        fault("callee-saved x" + CALLEE_SAVED[i] + " changed across a call", at);
                }
            } else if (rd === 1 && checks) call(next);
            if (rd) x[rd] = next;
            next = target;
            break;
        }
        case 0x0f: break; // fence, fence.i
        case 0x73: { // the CSR instructions on fflags (1), frm (2) and fcsr (3)
            const csr = w >>> 20;
            if ((f3 & 3) === 0 || csr < 1 || csr > 3) fault("unsupported system instruction", at);
            const old = csr === 1 ? fcsr & 31 : csr === 2 ? fcsr >> 5 : fcsr;
            const source = f3 & 4 ? rs1 : a;
            if ((f3 & 3) === 1 || rs1 !== 0) {
                const value = (f3 & 3) === 1 ? source : (f3 & 3) === 2 ? old | source : old & ~source;
                fcsr = csr === 1 ? (fcsr & 0xe0) | (value & 31) : csr === 2 ? (fcsr & 31) | ((value & 7) << 5) : value & 0xff;
            }
            x[rd] = old;
            break;
        }
        case 0x07: { // flw
            if (f3 !== 2) fault("unsupported F instruction", at);
            const address = a + imm;
            check(address, 4);
            f[rd] = memory.getUint32(address, true);
            break;
        }
        case 0x27: { // fsw
            if (f3 !== 2) fault("unsupported F instruction", at);
            const address = a + signed12((f7 << 5) | rd);
            check(address, 4);
            memory.setUint32(address, f[rs2], true);
            break;
        }
        case 0x43: case 0x47: case 0x4b: case 0x4f: { // fmadd, fmsub, fnmsub, fnmadd
            if (f7 & 3) fault("unsupported F instruction", at);
            const rm = rounding(f3);
            flags = 0;
            f[rd] = fma(f[rs1], f[rs2], f[w >>> 27], op >= 0x4b ? 1 : 0, op === 0x47 || op === 0x4f ? 1 : 0, rm);
            fcsr |= flags;
            break;
        }
        case 0x53: { // OP-FP
            const p = f[rs1], q = f[rs2];
            flags = 0;
            if (f7 === 0x00) f[rd] = fadd(p, q, rounding(f3));
            else if (f7 === 0x04) f[rd] = fadd(p, (q ^ SIGN) >>> 0, rounding(f3));
            else if (f7 === 0x08) f[rd] = fmul(p, q, rounding(f3));
            else if (f7 === 0x0c) f[rd] = fdiv(p, q, rounding(f3));
            else if (f7 === 0x2c && rs2 === 0) f[rd] = fsqrt(p, rounding(f3));
            else if (f7 === 0x10 && f3 < 3) f[rd] = ((p & 0x7fffffff) | ((f3 === 0 ? q : f3 === 1 ? ~q : p ^ q) & SIGN)) >>> 0;
            else if (f7 === 0x14 && f3 < 2) f[rd] = fminmax(p, q, f3 === 1);
            else if (f7 === 0x60 && rs2 < 2) x[rd] = toInt(p, rounding(f3), rs2 === 1);
            else if (f7 === 0x68 && rs2 < 2) f[rd] = fromInt(a, rounding(f3), rs2 === 1);
            else if (f7 === 0x70 && rs2 === 0 && f3 === 0) x[rd] = p;
            else if (f7 === 0x70 && rs2 === 0 && f3 === 1) x[rd] = fclass(p);
            else if (f7 === 0x50 && f3 < 3) x[rd] = fcompare(p, q, f3);
            else if (f7 === 0x78 && rs2 === 0 && f3 === 0) f[rd] = a;
            else fault("unsupported F instruction", at);
            fcsr |= flags;
            break;
        }
        default: fault("unsupported RV32 opcode 0x" + op.toString(16), at);
        }
        x[0] = 0;
        at = next;
    }
    return {trap: false, result: x[10], steps, counts, ...result()};
}

// Classify one instruction word for profiling. Checked-access shapes follow
// FunctionCode.checkedAddress: an unsigned branch over an ebreak is a bounds test,
// and a word load at offset 0 feeding that branch is a capacity load.
function classify(word, nextWord, afterWord) {
    const op = word & 0x7f, rs1 = (word >>> 15) & 31, rd = (word >>> 7) & 31;
    const kinds = [];
    if (op === 0x03) kinds.push(rs1 === 2 ? "spLoad" : "load");
    if (op === 0x23) kinds.push(rs1 === 2 ? "spStore" : "store");
    if (op === 0x63) {
        kinds.push("branch");
        if (((word >>> 12) & 7) === 6 && nextWord === EBREAK) kinds.push("boundsTest");
    }
    if (op === 0x6f && rd === 1) kinds.push("call");
    if (op === 0x33 && (word >>> 25) === 1) kinds.push(((word >>> 12) & 7) === 0 ? "mul" : "div");
    if (op === 0x03 && ((word >>> 12) & 7) === 2 && (word >> 20) === 0 && rs1 !== 2 &&
        (nextWord & 0x7f) === 0x63 && ((nextWord >>> 12) & 7) === 6 && afterWord === EBREAK &&
        ((nextWord >>> 20) & 31) === rd) kinds.push("capacityLoad");
    return kinds;
}

// Attribute execution counts to the functions of a compiled program. Functions are laid
// out contiguously in entry order, so each one ends where the next begins.
function profile(program, counts) {
    const image = program.image;
    const view = new DataView(image.buffer, image.byteOffset, image.byteLength);
    const starts = Object.entries(program.entries).sort((p, q) => p[1] - q[1]);
    const rows = [];
    for (let i = 0; i < starts.length; i++) {
        const [name, start] = starts[i];
        const end = i + 1 < starts.length ? starts[i + 1][1] : image.byteLength;
        const row = {name, start, bytes: end - start, steps: 0, spLoad: 0, spStore: 0, load: 0, store: 0,
            branch: 0, boundsTest: 0, capacityLoad: 0, call: 0, mul: 0, div: 0, entries: counts[start >>> 2]};
        for (let at = start; at < end; at += 4) {
            const n = counts[at >>> 2];
            if (!n) continue;
            row.steps += n;
            const word = view.getUint32(at, true);
            const nextWord = at + 4 < image.byteLength ? view.getUint32(at + 4, true) : 0;
            const afterWord = at + 8 < image.byteLength ? view.getUint32(at + 8, true) : 0;
            for (const kind of classify(word, nextWord, afterWord)) row[kind] += n;
        }
        rows.push(row);
    }
    return rows;
}

globalThis.typedRv32Interp = {run, profile, classify, Rv32Fault};
})();
