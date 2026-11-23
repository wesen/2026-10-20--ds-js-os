// The RV32 conformance vectors' inputs (PICOCALC-RV32-CONFORMANCE): which instruction words run with which
// registers, fcsr and memory, and, for the integer vectors, the small RV32I model that predicts them. bench/rv32/vectors.mjs
// turns them into bench/reference/rv32/vectors.jsonl and the P4 capture app's sources; its header explains the suite.
//
// Register convention (the capture app's stubs depend on it): rd = x10/f10, rs1 = x11/f11, rs2 = x12/f12,
// rs3 = f13. Memory instructions address a 32-byte window at WINDOW. Before the instruction x10 and f10 hold
// SENTINEL, so a write of rd is visible.
import {createHash} from "node:crypto";


export const PC = 0x2000;              // the instruction's address
export const IMAGE_BYTES = 0x4000;     // executors that keep code apart from data fill [0, IMAGE_BYTES) with ebreak
export const WINDOW = 0x1100;          // the memory window
export const WINDOW_BYTES = 32;
export const MEMORY_BYTES = 0x2000;    // guest data memory an executor must provide: [0, MEMORY_BYTES)
export const SENTINEL = 0xdeadbeef;

const u32 = n => n >>> 0;
export const hex = n => "0x" + u32(n).toString(16).padStart(8, "0");

// ---- encoders ----
const R = (op, rd, f3, rs1, rs2, f7) => u32((f7 << 25) | (rs2 << 20) | (rs1 << 15) | (f3 << 12) | (rd << 7) | op);
const I = (op, rd, f3, rs1, imm) => u32(((imm & 0xfff) << 20) | (rs1 << 15) | (f3 << 12) | (rd << 7) | op);
const S = (op, f3, rs1, rs2, imm) => u32((((imm >> 5) & 0x7f) << 25) | (rs2 << 20) | (rs1 << 15) | (f3 << 12) | ((imm & 31) << 7) | op);
const B = (f3, rs1, rs2, imm) => u32((((imm >> 12) & 1) << 31) | (((imm >> 5) & 0x3f) << 25) | (rs2 << 20) | (rs1 << 15) |
    (f3 << 12) | (((imm >> 1) & 15) << 8) | (((imm >> 11) & 1) << 7) | 0x63);
const U = (op, rd, imm) => u32((imm & 0xfffff000) | (rd << 7) | op);
const J = (rd, imm) => u32((((imm >> 20) & 1) << 31) | (((imm >> 1) & 0x3ff) << 21) | (((imm >> 11) & 1) << 20) |
    (imm & 0xff000) | (rd << 7) | 0x6f);
const R4 = (op, rd, rm, rs1, rs2, rs3, fmt = 0) => u32((rs3 << 27) | (fmt << 25) | (rs2 << 20) | (rs1 << 15) | (rm << 12) | (rd << 7) | op);

const RD = 10, RS1 = 11, RS2 = 12, RS3 = 13;
export const RM = {rne: 0, rtz: 1, rdn: 2, rup: 3, rmm: 4, dyn: 7};
const RM_NAMES = ["rne", "rtz", "rdn", "rup", "rmm"];

// A seeded generator, so the vectors are the same on every run.
function prng(seed) {
    let s = seed >>> 0 || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; };
}

// ---- inputs ----
const F = {
    pz: 0x00000000, nz: 0x80000000, minSub: 0x00000001, nMinSub: 0x80000001, maxSub: 0x007fffff, nMaxSub: 0x807fffff,
    minNorm: 0x00800000, nMinNorm: 0x80800000, one: 0x3f800000, nOne: 0xbf800000, onePlus: 0x3f800001,
    oneMinus: 0x3f7fffff, two: 0x40000000, three: 0x40400000, half: 0x3f000000, nHalf: 0xbf000000,
    tenth: 0x3dcccccd, nTenth: 0xbdcccccd, max: 0x7f7fffff, nMax: 0xff7fffff, inf: 0x7f800000, nInf: 0xff800000,
    qnan: 0x7fc00000, nqnan: 0xffc00000, qnanPayload: 0x7fc12345, snan: 0x7f800001, snanPayload: 0x7fa00000,
    nsnan: 0xff800001, two24: 0x4b800000, two31: 0x4f000000, nTwo31: 0xcf000000, two32: 0x4f800000,
    belowTwo31: 0x4effffff, nBelowTwo31: 0xceffffff, twoHalf: 0x40200000, nTwoHalf: 0xc0200000, oneHalf: 0x3fc00000,
    nOneHalf: 0xbfc00000, justBelowHalf: 0x3effffff, sub: 0x000ae7b4, nSub: 0x803a5c11, bigNorm: 0x7e967699,
    smallNorm: 0x01a3c0de, pi: 0x40490fdb, nPi: 0xc0490fdb,
};
// Every special input; the smaller pool keeps all-pairs tables of the rounding modes other than rne in bounds.
const SPECIAL = [F.pz, F.nz, F.minSub, F.nMinSub, F.maxSub, F.minNorm, F.nMinNorm, F.one, F.nOne, F.onePlus, F.three,
    F.tenth, F.nTenth, F.max, F.nMax, F.inf, F.nInf, F.qnan, F.qnanPayload, F.snan, F.nsnan, F.sub, F.pi, F.smallNorm];
const SMALL = [F.pz, F.nz, F.minSub, F.one, F.nOne, F.onePlus, F.tenth, F.max, F.nInf, F.qnan, F.snan, F.nSub];
const CONVERT = [...SPECIAL, F.half, F.nHalf, F.justBelowHalf, F.oneHalf, F.nOneHalf, F.twoHalf, F.nTwoHalf, F.two24,
    F.two31, F.nTwo31, F.two32, F.belowTwo31, F.nBelowTwo31, 0x4f7fffff, 0x4f800001, 0xbf7fffff, 0xbe800000, 0xc0400000,
    0x3f400000, 0xbf400000, 0x4e000000, 0xcf000001];
const INTS = [0, 1, -1, 2, 0x7fffffff, 0x80000000, 0x80000001, 0x7ffffffe, 31, 32, 33, 0x12345678, 0xfedcba98, -2, 0xffff,
    0x10000, 0x8000, 0x01000001, 0x01000003, 0x00ffffff, 0xffffff7f, 0x7fffffc0, 0x7fffff80, 0x40000001];
const ALU_INTS = [0, 1, -1, 0x7fffffff, 0x80000000, 31, 33, 0x12345678, 0xfedcba98, -2];

function randomFloat(next, kind) {
    const sign = next() & 0x80000000, mant = next() & 0x7fffff;
    let e;
    switch (kind) {
    case "any": return next();
    case "mid": e = 100 + next() % 55; break;
    case "high": e = 240 + next() % 15; break;
    case "low": e = next() % 40; break;
    case "unit": e = 120 + next() % 14; break;
    default: e = 1 + next() % 253;
    }
    return u32(sign | (e << 23) | mant);
}
const f32 = new Float32Array(1), u32v = new Uint32Array(f32.buffer);
const toBits = x => { f32[0] = x; return u32v[0]; };
const toFloat = b => { u32v[0] = b; return f32[0]; };

// ---- the vector list ----
// Each case: {id, class, word, x: {reg: value}, f: {reg: bits}, fcsr, mem: [bytes] | undefined, board, expect?}
export function generate() {
    const out = [];
    const seen = new Set();
    const add = c => {
        if (seen.has(c.id)) throw new Error("duplicate vector id " + c.id);
        seen.add(c.id);
        out.push(c);
    };
    const fp = (id, cls, word, f, extra = {}) => add({id, class: cls, word, x: {[RD]: SENTINEL, ...(extra.x ?? {})},
        f: {[RD]: SENTINEL, ...f}, fcsr: extra.fcsr ?? 0, mem: extra.mem, board: extra.board ?? true, expect: extra.expect});
    const next = prng(0x5eed2611);

    // Binary arithmetic: fadd, fsub, fmul, fdiv.
    const binary = [["fadd.s", 0x00], ["fsub.s", 0x04], ["fmul.s", 0x08], ["fdiv.s", 0x0c]];
    for (const [name, f7] of binary) {
        const word = rm => R(0x53, RD, rm, RS1, RS2, f7);
        const pool = name === "fsub.s" ? SMALL : SPECIAL;
        let n = 0;
        for (const a of pool) for (const b of pool) fp(`${name} rne ${n++}`, "f-arith", word(0), {[RS1]: a, [RS2]: b});
        const randoms = name === "fsub.s" ? 40 : 150;
        for (let i = 0; i < randoms; i++) {
            const [a, b] = randomPair(next, name);
            fp(`${name} rne r${i}`, "f-arith", word(0), {[RS1]: a, [RS2]: b});
        }
        for (let rm = 1; rm < 5; rm++) {
            if (name !== "fsub.s") {
                let k = 0;
                for (const a of SMALL) for (const b of SMALL) fp(`${name} ${RM_NAMES[rm]} ${k++}`, "f-arith", word(rm), {[RS1]: a, [RS2]: b});
            }
            for (let i = 0; i < (name === "fsub.s" ? 30 : 80); i++) {
                const [a, b] = randomPair(next, name);
                fp(`${name} ${RM_NAMES[rm]} r${i}`, "f-arith", word(rm), {[RS1]: a, [RS2]: b});
            }
        }
        // Dynamic rounding: frm selects the mode; a static mode ignores frm.
        for (let frm = 0; frm < 5; frm++) for (let i = 0; i < 6; i++) {
            const [a, b] = randomPair(next, name);
            fp(`${name} dyn frm=${RM_NAMES[frm]} ${i}`, "f-rm", word(7), {[RS1]: a, [RS2]: b}, {fcsr: frm << 5});
            fp(`${name} rne frm=${RM_NAMES[frm]} ${i}`, "f-rm", word(0), {[RS1]: a, [RS2]: b}, {fcsr: (frm << 5) | 0x1f});
        }
    }

    // fsqrt.s
    for (let rm = 0; rm < 5; rm++) {
        const word = R(0x53, RD, rm, RS1, 0, 0x2c);
        const pool = rm === 0 ? [...CONVERT, F.two, F.bigNorm] : SMALL;
        pool.forEach((a, k) => fp(`fsqrt.s ${RM_NAMES[rm]} ${k}`, "f-sqrt", word, {[RS1]: a}));
        for (let i = 0; i < 80; i++) {
            const a = randomFloat(next, ["mid", "low", "high", "unit"][i & 3]) & 0x7fffffff;
            fp(`fsqrt.s ${RM_NAMES[rm]} r${i}`, "f-sqrt", word, {[RS1]: a});
        }
    }
    for (let frm = 0; frm < 5; frm++)
        fp(`fsqrt.s dyn frm=${RM_NAMES[frm]}`, "f-rm", R(0x53, RD, 7, RS1, 0, 0x2c), {[RS1]: 0x40000000}, {fcsr: frm << 5});

    // Fused multiply-add.
    const fused = [["fmadd.s", 0x43], ["fmsub.s", 0x47], ["fnmsub.s", 0x4b], ["fnmadd.s", 0x4f]];
    const FMA_POOL = [F.pz, F.nz, F.minSub, F.one, F.nOne, F.max, F.inf, F.nInf, F.qnan, F.snan];
    for (const [name, op] of fused) {
        const word = rm => R4(op, RD, rm, RS1, RS2, RS3);
        let k = 0;
        const pool = name === "fmadd.s" ? FMA_POOL : [F.pz, F.nz, F.one, F.minSub, F.inf, F.qnan];
        for (const a of pool) for (const b of pool) for (const c of pool)
            fp(`${name} rne ${k++}`, "f-fma", word(0), {[RS1]: a, [RS2]: b, [RS3]: c});
        for (let rm = 0; rm < 5; rm++) {
            const count = name === "fmadd.s" ? 120 : 30;
            for (let i = 0; i < count; i++) {
                const [a, b, c] = randomTriple(next);
                fp(`${name} ${RM_NAMES[rm]} r${i}`, "f-fma", word(rm), {[RS1]: a, [RS2]: b, [RS3]: c});
            }
        }
        for (let frm = 0; frm < 5; frm++) {
            const [a, b, c] = randomTriple(next);
            fp(`${name} dyn frm=${RM_NAMES[frm]}`, "f-rm", word(7), {[RS1]: a, [RS2]: b, [RS3]: c}, {fcsr: frm << 5});
        }
    }

    // fmin, fmax, sign injection, compares: all pairs of the specials.
    const pairs = (name, cls, word, pool) => {
        let k = 0;
        for (const a of pool) for (const b of pool) fp(`${name} ${k++}`, cls, word, {[RS1]: a, [RS2]: b});
    };
    const MINMAX = [F.pz, F.nz, F.minSub, F.nMinSub, F.one, F.nOne, F.onePlus, F.max, F.nMax, F.inf, F.nInf, F.qnan,
        F.nqnan, F.qnanPayload, F.snan, F.nsnan, F.snanPayload, F.tenth, F.minNorm, F.sub];
    pairs("fmin.s", "f-minmax", R(0x53, RD, 0, RS1, RS2, 0x14), MINMAX);
    pairs("fmax.s", "f-minmax", R(0x53, RD, 1, RS1, RS2, 0x14), MINMAX);
    pairs("fsgnj.s", "f-sign", R(0x53, RD, 0, RS1, RS2, 0x10), SMALL);
    pairs("fsgnjn.s", "f-sign", R(0x53, RD, 1, RS1, RS2, 0x10), SMALL);
    pairs("fsgnjx.s", "f-sign", R(0x53, RD, 2, RS1, RS2, 0x10), SMALL);
    pairs("feq.s", "f-compare", R(0x53, RD, 2, RS1, RS2, 0x50), MINMAX);
    pairs("flt.s", "f-compare", R(0x53, RD, 1, RS1, RS2, 0x50), MINMAX);
    pairs("fle.s", "f-compare", R(0x53, RD, 0, RS1, RS2, 0x50), MINMAX);
    // Sign injection with rd = rs1 = rs2: fmv.s, fneg.s, fabs.s keep NaN payloads.
    for (const [name, f3] of [["fmv.s", 0], ["fneg.s", 1], ["fabs.s", 2]])
        for (const a of [F.snan, F.nqnan, F.qnanPayload, F.nz, F.one])
            fp(`${name} ${hex(a)}`, "f-sign", R(0x53, RD, f3, RS1, RS1, 0x10), {[RS1]: a});

    // fclass.s, fmv.x.w, fmv.w.x
    const CLASSES = [...CONVERT, F.snanPayload, F.nqnan, F.nMaxSub];
    CLASSES.forEach((a, k) => fp(`fclass.s ${k}`, "f-class", R(0x53, RD, 1, RS1, 0, 0x70), {[RS1]: a}));
    CLASSES.forEach((a, k) => fp(`fmv.x.w ${k}`, "f-move", R(0x53, RD, 0, RS1, 0, 0x70), {[RS1]: a}));
    CLASSES.forEach((a, k) => fp(`fmv.w.x ${k}`, "f-move", R(0x53, RD, 0, RS1, 0, 0x78), {}, {x: {[RS1]: a}}));

    // Conversions.
    for (const [name, rs2] of [["fcvt.w.s", 0], ["fcvt.wu.s", 1]]) {
        for (let rm = 0; rm < 5; rm++) {
            const word = R(0x53, RD, rm, RS1, rs2, 0x60);
            CONVERT.forEach((a, k) => fp(`${name} ${RM_NAMES[rm]} ${k}`, "f-convert", word, {[RS1]: a}));
            for (let i = 0; i < 50; i++) fp(`${name} ${RM_NAMES[rm]} r${i}`, "f-convert", word, {[RS1]: randomConvert(next)});
        }
        for (let frm = 0; frm < 5; frm++)
            for (const a of [F.twoHalf, F.nTwoHalf, 0x3fe00000, 0xbfe00000])
                fp(`${name} dyn frm=${RM_NAMES[frm]} ${hex(a)}`, "f-rm", R(0x53, RD, 7, RS1, rs2, 0x60), {[RS1]: a}, {fcsr: frm << 5});
    }
    for (const [name, rs2] of [["fcvt.s.w", 0], ["fcvt.s.wu", 1]]) {
        for (let rm = 0; rm < 5; rm++) {
            const word = R(0x53, RD, rm, RS1, rs2, 0x68);
            INTS.forEach((a, k) => fp(`${name} ${RM_NAMES[rm]} ${k}`, "f-convert", word, {}, {x: {[RS1]: u32(a)}}));
            for (let i = 0; i < 40; i++) {
                const a = i & 1 ? next() : next() >>> (next() % 8);
                fp(`${name} ${RM_NAMES[rm]} r${i}`, "f-convert", word, {}, {x: {[RS1]: a}});
            }
        }
        for (let frm = 0; frm < 5; frm++)
            fp(`${name} dyn frm=${RM_NAMES[frm]}`, "f-rm", R(0x53, RD, 7, RS1, rs2, 0x68), {}, {x: {[RS1]: 0x01000003}, fcsr: frm << 5});
    }

    // flw and fsw: raw bits through memory, NaN payloads unchanged.
    const window = seed => Array.from({length: WINDOW_BYTES}, (_, i) => (seed * 37 + i * 11) & 255);
    [[0, 0], [4, 1], [-8, 2], [12, 3], [20, 4]].forEach(([imm, s]) => {
        fp(`flw ${imm}`, "f-memory", I(0x07, RD, 2, RS1, imm), {}, {x: {[RS1]: WINDOW + 8}, mem: window(s)});
    });
    [F.snan, F.nqnan, F.qnanPayload, F.nz, F.max].forEach((a, k) => {
        const imm = [0, 4, -4, 8, 24][k];
        fp(`fsw ${hex(a)} ${imm}`, "f-memory", S(0x27, 2, RS1, RS2, imm), {[RS2]: a}, {x: {[RS1]: WINDOW + 4}, mem: window(k + 5)});
    });

    // fcsr, frm and fflags through the CSR instructions.
    const csr = (f3, csrNo, src) => u32((csrNo << 20) | (src << 15) | (f3 << 12) | (RD << 7) | 0x73);
    const CSR_CASES = [["csrrw", 1], ["csrrs", 2], ["csrrc", 3], ["csrrwi", 5], ["csrrsi", 6], ["csrrci", 7]];
    for (const [csrName, csrNo] of [["fflags", 1], ["frm", 2], ["fcsr", 3]])
        for (const [name, f3] of CSR_CASES)
            for (const [fcsr, value] of [[0x00, 0xffffffff], [0xff, 0x15], [0x6b, 0x0a], [0xa5, 0]]) {
                const imm = f3 >= 5;
                const src = imm ? value & 31 : RS1;
                fp(`${name} ${csrName} ${hex(fcsr)} ${hex(value)}`, "f-csr", csr(f3, csrNo, src), {},
                    {x: {[RS1]: u32(value)}, fcsr});
            }
    // csrrs with rs1 = x0 reads without writing.
    for (const [csrName, csrNo] of [["fflags", 1], ["frm", 2], ["fcsr", 3]])
        fp(`frcsr-like ${csrName}`, "f-csr", u32((csrNo << 20) | (2 << 12) | (RD << 7) | 0x73), {}, {fcsr: 0xb7});

    // Encodings every executor must reject (illegal instruction). Not run on the board: they trap.
    const illegal = (id, word, fcsr = 0) => fp(id, "f-illegal", word, {[RS1]: F.one, [RS2]: F.two}, {fcsr, board: false, expect: {fault: "illegal"}});
    illegal("fadd.s rm=5", R(0x53, RD, 5, RS1, RS2, 0x00));
    illegal("fmul.s rm=6", R(0x53, RD, 6, RS1, RS2, 0x08));
    illegal("fadd.s dyn frm=5", R(0x53, RD, 7, RS1, RS2, 0x00), 5 << 5);
    illegal("fsqrt.s dyn frm=7", R(0x53, RD, 7, RS1, 0, 0x2c), 7 << 5);
    illegal("fcvt.w.s dyn frm=6", R(0x53, RD, 7, RS1, 0, 0x60), 6 << 5);
    illegal("fadd.d (fmt=01)", R(0x53, RD, 0, RS1, RS2, 0x01));
    illegal("fmadd.d (fmt=01)", R4(0x43, RD, 0, RS1, RS2, RS3, 1));
    illegal("fsgnj.s f3=3", R(0x53, RD, 3, RS1, RS2, 0x10));
    illegal("fmin.s f3=2", R(0x53, RD, 2, RS1, RS2, 0x14));
    illegal("feq.s f3=3", R(0x53, RD, 3, RS1, RS2, 0x50));
    illegal("fsqrt.s rs2=1", R(0x53, RD, 0, RS1, 1, 0x2c));
    illegal("fcvt.w.s rs2=2", R(0x53, RD, 0, RS1, 2, 0x60));
    illegal("fmv.x.w f3=2", R(0x53, RD, 2, RS1, 0, 0x70));
    illegal("fmv.w.x f3=1", R(0x53, RD, 1, RS1, 0, 0x78));
    illegal("flw f3=3", I(0x07, RD, 3, RS1, 0));
    illegal("fsw f3=1", S(0x27, 1, RS1, RS2, 0));

    integerVectors(add, next);
    return out;
}

function randomPair(next, name) {
    switch (next() % 8) {
    case 0: return [next(), next()];                                        // any bits, NaNs included
    case 1: return [randomFloat(next, "high"), randomFloat(next, "high")]; // overflow
    case 2: return [randomFloat(next, "low"), randomFloat(next, "low")];   // subnormal results
    case 3: { // cancellation: b close to -a (fadd) or a (fsub, fdiv)
        const a = randomFloat(next, "mid");
        const b = u32((a ^ (name === "fadd.s" ? 0x80000000 : 0)) + ((next() % 17) - 8));
        return [a, b];
    }
    case 4: return [randomFloat(next, "low"), randomFloat(next, "unit")];
    case 5: return [randomFloat(next, "unit"), randomFloat(next, name === "fdiv.s" ? "high" : "low")];
    default: return [randomFloat(next, "mid"), randomFloat(next, "mid")];
    }
}

function randomTriple(next) {
    const a = randomFloat(next, "unit"), b = randomFloat(next, "unit");
    switch (next() % 6) {
    case 0: return [next(), next(), next()];
    case 1: { // c near -(a*b): the fused result depends on the product's low bits
        const p = toBits(Math.fround(toFloat(a) * toFloat(b)));
        return [a, b, u32((p ^ 0x80000000) + ((next() % 9) - 4))];
    }
    case 2: return [randomFloat(next, "high"), randomFloat(next, "unit"), randomFloat(next, "high")];
    case 3: return [randomFloat(next, "low"), randomFloat(next, "unit"), randomFloat(next, "low")];
    case 4: return [a, b, randomFloat(next, "low")];
    default: return [a, b, randomFloat(next, "unit")];
    }
}

function randomConvert(next) {
    switch (next() % 4) {
    case 0: return next();
    case 1: { // near the int32 / uint32 limits
        const e = 156 + next() % 4; // 2^29 .. 2^32
        return u32((next() & 0x80000000) | (e << 23) | (next() & 0x7fffff));
    }
    case 2: { // an exact half: k + 0.5
        const k = (next() % 2001) - 1000;
        return toBits(k + 0.5);
    }
    default: return randomFloat(next, "unit") ^ (next() & 0x80000000);
    }
}

// ---- integer vectors and their model ----
const INT_OPS = {
    add: [0, 0x00, (a, b) => a + b], sub: [0, 0x20, (a, b) => a - b], sll: [1, 0, (a, b) => a << (b & 31)],
    slt: [2, 0, (a, b) => Number((a | 0) < (b | 0))], sltu: [3, 0, (a, b) => Number(u32(a) < u32(b))],
    xor: [4, 0, (a, b) => a ^ b], srl: [5, 0, (a, b) => u32(a) >>> (b & 31)], sra: [5, 0x20, (a, b) => (a | 0) >> (b & 31)],
    or: [6, 0, (a, b) => a | b], and: [7, 0, (a, b) => a & b],
    mul: [0, 1, (a, b) => Math.imul(a, b)],
    mulh: [1, 1, (a, b) => Number((BigInt(a | 0) * BigInt(b | 0)) >> 32n)],
    mulhsu: [2, 1, (a, b) => Number(BigInt.asIntN(32, (BigInt(a | 0) * BigInt(u32(b))) >> 32n))],
    mulhu: [3, 1, (a, b) => Number(BigInt.asIntN(32, (BigInt(u32(a)) * BigInt(u32(b))) >> 32n))],
    div: [4, 1, (a, b) => (b | 0) === 0 ? -1 : (a | 0) === -2147483648 && (b | 0) === -1 ? a : Math.trunc((a | 0) / (b | 0))],
    divu: [5, 1, (a, b) => u32(b) === 0 ? -1 : Math.floor(u32(a) / u32(b))],
    rem: [6, 1, (a, b) => (b | 0) === 0 ? a : (a | 0) === -2147483648 && (b | 0) === -1 ? 0 : (a | 0) % (b | 0)],
    remu: [7, 1, (a, b) => u32(b) === 0 ? a : u32(a) % u32(b)],
};
const IMM_OPS = {
    addi: [0, (a, i) => a + i], slti: [2, (a, i) => Number((a | 0) < i)], sltiu: [3, (a, i) => Number(u32(a) < u32(i))],
    xori: [4, (a, i) => a ^ i], ori: [6, (a, i) => a | i], andi: [7, (a, i) => a & i],
};
const LOADS = {lb: [0, 1, (v, o) => (v.getInt8(o))], lh: [1, 2, (v, o) => v.getInt16(o, true)], lw: [2, 4, (v, o) => v.getInt32(o, true)],
    lbu: [4, 1, (v, o) => v.getUint8(o)], lhu: [5, 2, (v, o) => v.getUint16(o, true)]};
const STORES = {sb: [0, 1], sh: [1, 2], sw: [2, 4]};

function integerVectors(add, next) {
    const iv = (id, cls, word, x, model, extra = {}) => {
        const c = {id, class: cls, word, x: {[RD]: SENTINEL, ...Object.fromEntries(Object.entries(x).map(([k, v]) => [k, u32(v)]))},
            f: {}, fcsr: 0, mem: extra.mem, board: extra.board ?? true};
        c.model = model(c);
        add(c);
    };
    const rr = (fn) => c => ({x: {[RD]: u32(fn(c.x[RS1], c.x[RS2]))}});
    for (const [name, [f3, f7, fn]] of Object.entries(INT_OPS)) {
        let k = 0;
        for (const a of ALU_INTS) for (const b of ALU_INTS)
            iv(`${name} ${k++}`, f7 === 1 ? "i-m" : "i-alu", R(0x33, RD, f3, RS1, RS2, f7), {[RS1]: a, [RS2]: b}, rr(fn));
        for (let i = 0; i < 12; i++)
            iv(`${name} r${i}`, f7 === 1 ? "i-m" : "i-alu", R(0x33, RD, f3, RS1, RS2, f7), {[RS1]: next(), [RS2]: i & 1 ? next() : next() % 64}, rr(fn));
    }
    const IMMS = [0, 1, -1, 2047, -2048, 0x555, -0x2aa];
    for (const [name, [f3, fn]] of Object.entries(IMM_OPS))
        for (const a of ALU_INTS.slice(0, 9)) for (const imm of IMMS)
            iv(`${name} ${hex(a)} ${imm}`, "i-alu", I(0x13, RD, f3, RS1, imm), {[RS1]: a}, c => ({x: {[RD]: u32(fn(c.x[RS1], imm))}}));
    for (const [name, f3, f7, fn] of [["slli", 1, 0, (a, s) => a << s], ["srli", 5, 0, (a, s) => a >>> s], ["srai", 5, 0x20, (a, s) => (a | 0) >> s]])
        for (const a of [1, -1, 0x80000000, 0x12345678, 0x7fffffff]) for (const s of [0, 1, 15, 31])
            iv(`${name} ${hex(a)} ${s}`, "i-alu", I(0x13, RD, f3, RS1, (f7 << 5) | s), {[RS1]: a}, c => ({x: {[RD]: u32(fn(c.x[RS1], s))}}));
    for (const v of [0, 0x1000, 0x80000000, 0xfffff000, 0x12345000, 0x7ffff000])
        iv(`lui ${hex(v)}`, "i-alu", U(0x37, RD, v), {}, () => ({x: {[RD]: v}}));

    // Loads and stores within the window, aligned, sign- and zero-extended.
    const window = Array.from({length: WINDOW_BYTES}, (_, i) => (0x81 + i * 0x35) & 255);
    const view = () => new DataView(Uint8Array.from(window).buffer);
    for (const [name, [f3, width, fn]] of Object.entries(LOADS))
        for (const [base, imm] of [[WINDOW, 0], [WINDOW + 16, -16 + width], [WINDOW + 8, 8], [WINDOW + 30 - width - 2, 2], [WINDOW + 4, 12]]) {
            const at = base + imm - WINDOW;
            if (at % width) continue;
            iv(`${name} ${hex(base)} ${imm}`, "i-memory", I(0x03, RD, f3, RS1, imm), {[RS1]: base},
                () => ({x: {[RD]: u32(fn(view(), at))}, mem: window}), {mem: window});
        }
    for (const [name, [f3, width]] of Object.entries(STORES))
        for (const [base, imm, value] of [[WINDOW, 0, 0x89abcdef], [WINDOW + 16, -8, 0x01234567], [WINDOW + 20, 8, 0xfffffffe], [WINDOW + 8, 4, 0x80]]) {
            const at = base + imm - WINDOW;
            iv(`${name} ${hex(base)} ${imm}`, "i-memory", S(0x23, f3, RS1, RS2, imm), {[RS1]: base, [RS2]: value}, () => {
                const after = window.slice();
                for (let i = 0; i < width; i++) after[at + i] = (value >>> (8 * i)) & 255;
                return {mem: after};
            }, {mem: window});
        }

    // Control flow, auipc, x0 and aliasing: the model only (the board's pc is not the vector's).
    const pc = PC;
    const branch = {beq: [0, (a, b) => a === b], bne: [1, (a, b) => a !== b], blt: [4, (a, b) => (a | 0) < (b | 0)],
        bge: [5, (a, b) => (a | 0) >= (b | 0)], bltu: [6, (a, b) => u32(a) < u32(b)], bgeu: [7, (a, b) => u32(a) >= u32(b)]};
    const BRANCH_INTS = [0, 1, -1, 0x7fffffff, 0x80000000];
    for (const [name, [f3, fn]] of Object.entries(branch)) {
        let k = 0;
        for (const a of BRANCH_INTS) for (const b of BRANCH_INTS) {
            const offset = [8, -8, 0x7fc, -0x800, 0x1000 - 4, -0x1000][k % 6];
            iv(`${name} ${k++}`, "i-branch", B(f3, RS1, RS2, offset), {[RS1]: a, [RS2]: b},
                c => ({next: fn(c.x[RS1], c.x[RS2]) ? pc + offset : pc + 4}), {board: false});
        }
    }
    for (const offset of [4, 8, -4, 0x7fc, -0x800, 0x1ff0, -0x2000])
        for (const rd of [0, 1, RD])
            iv(`jal x${rd} ${offset}`, "i-jump", J(rd, offset), {}, () => ({next: pc + offset, x: rd ? {[rd]: pc + 4} : {}}), {board: false});
    for (const [base, imm] of [[0x1000, 0], [0x3000, -4], [0x2001, 7], [0x2101, 0], [0x1802, -2], [0x3ff0, 8]])
        for (const rd of [0, RD])
            iv(`jalr x${rd} ${hex(base)} ${imm}`, "i-jump", I(0x67, rd, 0, RS1, imm), {[RS1]: base},
                () => ({next: (base + imm) & ~1, x: rd ? {[rd]: pc + 4} : {}}), {board: false});
    // jalr with rd = rs1: the target is computed from the old value.
    iv("jalr x11 x11", "i-jump", I(0x67, RS1, 0, RS1, 4), {[RS1]: 0x1000}, () => ({next: 0x1004, x: {[RS1]: pc + 4}}), {board: false});
    for (const v of [0, 0x1000, 0xfffff000, 0x80000000])
        iv(`auipc ${hex(v)}`, "i-alu", U(0x17, RD, v), {}, () => ({x: {[RD]: u32(pc + v)}}), {board: false});
    // x0 is never written; rd may equal a source.
    iv("add x0", "i-alu", R(0x33, 0, 0, RS1, RS2, 0), {[RS1]: 5, [RS2]: 7}, () => ({x: {}}), {board: false});
    iv("lui x0", "i-alu", U(0x37, 0, 0x12345000), {}, () => ({x: {}}), {board: false});
    iv("addi x11 x11", "i-alu", I(0x13, RS1, 0, RS1, -1), {[RS1]: 0}, () => ({x: {[RS1]: 0xffffffff}}), {board: false});
    iv("sub x12 x11 x12", "i-alu", R(0x33, RS2, 0, RS1, RS2, 0x20), {[RS1]: 3, [RS2]: 10}, () => ({x: {[RS2]: u32(-7)}}), {board: false});
    iv("lw x0", "i-memory", I(0x03, 0, 2, RS1, 0), {[RS1]: WINDOW}, () => ({x: {}, mem: window}), {board: false, mem: window});
    iv("fence", "i-alu", 0x0ff0000f, {}, () => ({x: {}}), {board: false});
}

// A capture line: {id, word, in: digest of the inputs, x10, f10, fcsr, mem?}
export function inputDigest(c) {
    const h = createHash("sha256");
    h.update(JSON.stringify([c.word, c.x, c.f, c.fcsr, c.mem ?? null]));
    return h.digest("hex").slice(0, 16);
}
