// Experimental backend pass for the Typed frontend's checked numeric IR.
// This script is injected before the ordinary RV32 compiler closure.
(() => {
"use strict";

const GET = 0x20, SET = 0x21, CONST = 0x41, END = 0x0b;
const ADD = 0x6a, SUB = 0x6b, MUL = 0x6c, REM = 0x6f;
const QR = [0, 1, 2, 4, 5, 6, 7]; // ESP-IDF 5.4.2 PIE context switch omits q3.
const NO_MATCH = Symbol("ineligible PIE loop");

function narrow(lo, hi, value) {
    if (lo < -32768 || hi > 32767) throw NO_MATCH;
    return {lo, hi, ...value};
}

function arithmetic(op, lhs, rhs) {
    switch (op) {
    case ADD: return narrow(lhs.lo + rhs.lo, lhs.hi + rhs.hi, {op, lhs, rhs});
    case SUB: return narrow(lhs.lo - rhs.hi, lhs.hi - rhs.lo, {op, lhs, rhs});
    case MUL: {
        if (lhs.kind === "constant") [lhs, rhs] = [rhs, lhs];
        const factor = rhs.value;
        if (rhs.kind !== "constant" || factor < 1 || factor > 16) throw NO_MATCH;
        return narrow(lhs.lo * factor, lhs.hi * factor, {op, lhs, factor});
    }
    default: throw NO_MATCH;
    }
}

class Matcher {
    constructor(fn) {
        this.fn = fn;
        this.code = fn.code;
        this.at = 0;
        this.inputs = [];
        this.outputs = [];
        this.locals = new Map();
        this.positions = [];
    }

    next() {
        if (this.at >= this.code.length) throw NO_MATCH;
        return this.code[this.at++];
    }

    expect(...values) {
        for (const value of values) if (this.next() !== value) throw NO_MATCH;
    }

    position() {
        this.expect(GET, this.index, SET);
        const tmp = this.next();
        if (tmp <= this.index || this.positions.includes(tmp)) throw NO_MATCH;
        this.positions.push(tmp);
        this.expect(GET, tmp, GET);
        const buffer = this.next();
        if (this.fn.params[buffer] !== "buffer") throw NO_MATCH;
        this.expect(0x28, 2, 0, 0x4f, 0x04, 0x40, 0, END, GET, buffer, GET, tmp, CONST, 1, 0x74, ADD);
        return buffer;
    }

    input(buffer) {
        this.expect(0x2f, 1, 4, CONST);
        const modulus = this.next();
        if (modulus < 2 || modulus > 32768 || (modulus & (modulus - 1))) throw NO_MATCH;
        this.expect(REM, SET);
        const local = this.next();
        if (local <= this.index || this.positions.includes(local) || this.locals.has(local) ||
            this.inputs.some(input => input.buffer === buffer)) throw NO_MATCH;
        const input = narrow(0, modulus - 1, {kind: "input", buffer, local, mask: modulus - 1});
        this.inputs.push(input);
        this.locals.set(local, input);
    }

    expression() {
        const stack = [];
        for (let i = 0; i < 64; i++) {
            const op = this.next();
            if (op === 0x3b) {
                this.expect(1, 4);
                if (stack.length !== 1) throw NO_MATCH;
                return stack[0];
            }
            if (op === CONST) {
                const value = this.next();
                stack.push(narrow(value, value, {kind: "constant", value}));
            } else if (op === GET) {
                const input = this.locals.get(this.next());
                if (!input) throw NO_MATCH;
                stack.push(input);
            } else {
                if (stack.length < 2) throw NO_MATCH;
                const rhs = stack.pop(), lhs = stack.pop();
                stack.push(arithmetic(op, lhs, rhs));
            }
        }
        throw NO_MATCH;
    }

    run() {
        this.expect(CONST, 0, SET);
        const index = this.index = this.next();
        if (index !== this.fn.params.length) throw NO_MATCH;
        this.expect(0x02, 0x40, 0x03, 0x40, GET, index, GET);
        const count = this.next();
        if (this.fn.params[count] !== "i32") throw NO_MATCH;
        this.expect(0x48, 0x45, 0x0d, 1);

        while (this.code[this.at + 2] === SET) {
            const buffer = this.position();
            if (this.code[this.at] === 0x2f && this.outputs.length === 0) this.input(buffer);
            else this.outputs.push({buffer, value: this.expression()});
            if (this.inputs.length + this.outputs.length > 6) throw NO_MATCH;
        }
        this.expect(GET, index, CONST, 1, ADD, SET, index, 0x0c, 0, END, END);
        if (!this.inputs.length || !this.outputs.length) throw NO_MATCH;
        const buffers = [...this.inputs, ...this.outputs].map(access => access.buffer);
        if (new Set(buffers).size !== buffers.length) throw NO_MATCH;
        // No lowered local can be live after the loop. Match conservatively
        // here, including words that happen to resemble a GET opcode.
        for (let i = this.at; i < this.code.length - 1; i++) {
            if (this.code[i] === GET && (this.locals.has(this.code[i + 1]) || this.positions.includes(this.code[i + 1]))) throw NO_MATCH;
        }
        return {index, count, buffers, positions: this.positions, inputs: this.inputs, outputs: this.outputs};
    }
}

function match(fn) {
    try { return new Matcher(fn).run(); }
    catch (error) {
        if (error !== NO_MATCH) throw error;
        return null;
    }
}

// Independently assemble these opcode templates using scripts/04-check-isa.mjs.
const pieMemory = (op, q, base) => op | (q << 10) | ((base - 8) << 15);
const pieAnd = (dst, a, b) => 0x0004205f | (dst << 7) | (a << 29) | (b << 26);
const pieArithmetic = (op, dst, a, b) => op | (dst << 20) | (a << 29) | (b << 26);
const LOAD = 0x0200223b, STORE = 0x8200223b, BROADCAST = 0x8600203b;
const VADD = 0x0284065f, VSUB = 0x028406df;

class VectorPlan {
    constructor(plan) {
        this.pointers = new Map(plan.buffers.map((local, i) => [local, 10 + i]));
        this.inputs = new Map();
        this.words = [];
        this.free = QR.slice().reverse();
        const masks = new Map();
        for (const input of plan.inputs) {
            this.inputs.set(input.local, this.allocate());
            if (!masks.has(input.mask)) masks.set(input.mask, []);
            masks.get(input.mask).push(input);
        }
        for (const [maskValue, inputs] of masks) {
            const mask = this.broadcast(maskValue);
            for (const input of inputs) {
                const q = this.inputs.get(input.local);
                this.words.push(pieMemory(LOAD, q, this.pointers.get(input.buffer)), pieAnd(q, q, mask));
            }
            this.free.push(mask);
        }
        for (const output of plan.outputs) {
            const value = this.expression(output.value);
            this.words.push(pieMemory(STORE, value.q, this.pointers.get(output.buffer)));
            this.release(value);
        }
    }

    allocate() {
        if (!this.free.length) throw NO_MATCH;
        return this.free.pop();
    }

    broadcast(value) {
        const q = this.allocate();
        this.words.push({q, value});
        return q;
    }

    release(value) {
        if (value.temporary) this.free.push(value.q);
    }

    expression(value) {
        if (value.kind === "input") return {q: this.inputs.get(value.local), temporary: false};
        if (value.kind === "constant") return {q: this.broadcast(value.value), temporary: true};
        const lhs = this.expression(value.lhs);
        if (value.op === MUL) {
            if (value.factor === 1) return lhs;
            const q = this.allocate();
            // For factor k, doubling a prefix and adding one input produces
            // positive multiples no larger than k, covered by the same proof.
            this.words.push(pieArithmetic(VADD, q, lhs.q, lhs.q));
            if (value.factor > 2) {
                const bits = value.factor.toString(2).slice(1);
                if (bits[0] === "1") this.words.push(pieArithmetic(VADD, q, q, lhs.q));
                for (const bit of bits.slice(1)) {
                    this.words.push(pieArithmetic(VADD, q, q, q));
                    if (bit === "1") this.words.push(pieArithmetic(VADD, q, q, lhs.q));
                }
            }
            this.release(lhs);
            return {q, temporary: true};
        }
        const rhs = this.expression(value.rhs);
        const q = lhs.temporary ? lhs.q : rhs.temporary ? rhs.q : this.allocate();
        this.words.push(pieArithmetic(value.op === ADD ? VADD : VSUB, q, lhs.q, rhs.q));
        if (lhs.q !== q) this.release(lhs);
        if (rhs.q !== q) this.release(rhs);
        return {q, temporary: true};
    }
}

function emitPortableBody(code, instruction, plan, pointers) {
    const free = [17, 16, 29, 7, 6, 5];
    const i = (rd, f3, rs, immediate) => code.emit(instruction.i(0x13, rd, f3, rs, immediate));
    const r = (rd, lhs, rhs, func) => code.emit(instruction.r(0x33, rd, 0, lhs, rhs, func));

    function expression(value) {
        if (value.kind === "input" || value.kind === "constant") {
            const reg = free.pop();
            if (reg === undefined) throw NO_MATCH;
            if (value.kind === "input") code.load(reg, 4 * value.local);
            else code.constant(reg, value.value);
            return reg;
        }
        const lhs = expression(value.lhs);
        if (value.op === MUL) {
            const reg = free.pop();
            if (reg === undefined) throw NO_MATCH;
            code.constant(reg, value.factor);
            r(lhs, lhs, reg, 1);
            free.push(reg);
        } else {
            const rhs = expression(value.rhs);
            r(lhs, lhs, rhs, value.op === SUB ? 0x20 : 0);
            free.push(rhs);
        }
        return lhs;
    }

    for (const input of plan.inputs) {
        const pointer = pointers.get(input.buffer);
        code.load(5, 0, pointer, 5); // unsigned halfword
        if (input.mask <= 2047) i(5, 7, 5, input.mask);
        else {
            code.constant(6, input.mask);
            code.emit(instruction.r(0x33, 5, 7, 5, 6));
        }
        code.store(5, 4 * input.local);
        i(pointer, 0, pointer, 2);
    }
    for (const output of plan.outputs) {
        const pointer = pointers.get(output.buffer);
        const reg = expression(output.value);
        code.store(reg, 0, pointer, 1);
        i(pointer, 0, pointer, 2);
        free.push(reg);
    }
}

function prefix(code, instruction, diagnostics, portable) {
    const plan = match(code.program);
    if (!plan) return;
    const pressure = value => {
        if (value.kind) return 1;
        if (value.op === MUL) return Math.max(2, pressure(value.lhs));
        return Math.max(pressure(value.lhs), 1 + pressure(value.rhs));
    };
    if (portable && plan.outputs.some(output => pressure(output.value) > 6)) return;
    let vector;
    try { vector = new VectorPlan(plan); }
    catch (error) {
        if (error !== NO_MATCH) throw error;
        return;
    }
    const A0 = 10, S0 = 8, T0 = 5, T1 = 6, T2 = 7, T3 = 28, T5 = 30, T6 = 31, SP = 2;
    const addi = (rd, rs, n) => code.emit(instruction.i(0x13, rd, 0, rs, n));
    const andi = (rd, rs, n) => code.emit(instruction.i(0x13, rd, 7, rs, n));
    const shli = (rd, rs, n) => code.emit(instruction.i(0x13, rd, 1, rs, n));
    const sub = (rd, a, b) => code.emit(instruction.r(0x33, rd, 0, a, b, 0x20));
    const scalar = {}, vectorTop = {};
    // The first read and first write each allocated a position temporary.
    // No loop or suffix reads either slot before the scalar loop sets it.
    const saveS0 = 4 * plan.positions[0];
    const constantSlot = 4 * plan.positions[1];
    const bufferRegs = plan.buffers.map((_, i) => A0 + i);
    const written = new Set(plan.outputs.map(output => vector.pointers.get(output.buffer)));

    // This prefix comes after the original i=0 initializer. Every failed
    // guard branches to the original scalar entry before any buffer write.
    code.load(T5, 4 * plan.count);
    code.constant(T6, 8);
    code.branch(4, T5, T6, scalar);
    code.constant(T6, 16384);
    code.branch(7, T5, T6, scalar);
    andi(T5, T5, -8);
    shli(T6, T5, 1);
    addi(T6, T6, 4);
    for (const [i, reg] of bufferRegs.entries()) {
        code.load(reg, 4 * plan.buffers[i]);
        andi(T0, reg, 15);
        code.constant(T1, 12);
        code.branch(1, T0, T1, scalar);
        code.load(T0, 0, reg);
        code.branch(6, T0, T5, scalar);
        code.emit(instruction.r(0x33, T0, 0, reg, T6));
        code.branch(6, T0, reg, scalar);
    }
    for (let i = 0; i < bufferRegs.length; i++) {
        const a = bufferRegs[i];
        for (const b of bufferRegs.slice(i + 1)) {
            if (!written.has(a) && !written.has(b)) continue;
            sub(T0, a, b);
            sub(T1, b, a);
            code.branch(6, T0, T6, scalar);
            code.branch(6, T1, T6, scalar);
        }
    }

    for (const reg of bufferRegs) addi(reg, reg, 4);
    if (!portable) {
        code.store(S0, saveS0);
        addi(S0, SP, constantSlot);
    }
    code.move(T3, T5);
    code.mark(vectorTop);
    const bodyStart = code.words.length;
    if (portable) emitPortableBody(code, instruction, plan, vector.pointers);
    else {
        for (const word of vector.words) {
            if (typeof word === "number") code.emit(word);
            else {
                code.constant(T2, word.value);
                code.store(T2, 0, S0, 1);
                code.emit(pieMemory(BROADCAST, word.q, S0));
            }
        }
    }
    addi(T5, T5, portable ? -1 : -8);
    code.branch(1, T5, 0, vectorTop);
    const loopWords = code.words.length - bodyStart;
    code.store(T3, 4 * plan.index);
    if (!portable) code.load(S0, saveS0);
    code.mark(scalar);
    if (diagnostics) diagnostics.push({
        function: code.program.name,
        lanes: portable ? 1 : 8,
        inputs: plan.inputs.map(({buffer, lo, hi}) => ({buffer, lo, hi})),
        outputs: plan.outputs.map(({buffer, value: {lo, hi}}) => ({buffer, lo, hi})),
        loopWords,
    });
}

globalThis.typedPieExperiment = {prefix};
})();
