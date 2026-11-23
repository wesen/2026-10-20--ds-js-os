// FunctionCode's operand stack: loads, stores, constants, result destinations, spills.
import {SP, S0, instruction, ZERO, OPERAND_STACKS, T5, FT10} from "../encoding/registers.js";

// A large frame's second base: s0 = sp + LARGE_BASE reaches the slots at LARGE_BASE and above (function-code.js).
export const LARGE_BASE = 2032;
import {loadWord, moveWord, storeWord} from "../encoding/instructions.js";
import {LOCAL_SET} from "../encoding/tape.js";

export class StackMethods {
    // A float register (32-63) loads and stores a word (flw, fsw); kind is the integer width (lw, lhu, sh...).
    load(reg, offset, base = SP, kind = 2) {
        if (base === SP) this.usesFrame = true;
        if (base === SP && offset >= LARGE_BASE && this.large) { base = S0; offset -= LARGE_BASE; }
        this.emit(reg < 32 ? instruction.i(0x03, reg, kind, base, offset) : loadWord(reg, offset, base));
    }

    store(reg, offset, base = SP, kind = 2) {
        if (base === SP) this.usesFrame = true;
        if (base === SP && offset >= LARGE_BASE && this.large) { base = S0; offset -= LARGE_BASE; }
        this.emit(reg < 32 ? instruction.s(kind, base, reg, offset) : storeWord(reg, offset, base));
    }

    constant(reg, n) {
        const lo = (n << 20) >> 20;
        if (n !== lo) this.emit(((n - lo) & 0xfffff000) | (reg << 7) | 0x37);
        if (n === lo || lo !== 0 || !this.select?.immediates)
            this.emit(instruction.i(0x13, reg, 0, n === lo ? ZERO : reg, lo));
    }

    // select.results: when the next operation stores this result into a homed local, the
    // result is computed in the home and the store disappears. Call after popping the
    // operands; every caller's sequence reads its operands no later than its first write.
    destination() {
        const tape = this.program.code, plan = this.locations;
        if (!this.select?.results || !plan || tape[this.at] !== LOCAL_SET || plan.forward.has(this.at)) return undefined;
        const home = plan.homes.get(tape[this.at + 1]);
        if (home === undefined) return undefined;
        this.pendingWrite = [tape[this.at + 1], this.at];
        this.at += 2;
        this.materialize(home);
        return home;
    }

    // Push a result computed in resultRegister(), unless destination() stored it already.
    result(out, stored) {
        if (stored === undefined) this.push(out);
        else if (this.pendingWrite) {
            const [local, at] = this.pendingWrite;
            this.pendingWrite = undefined;
            this.pointersAfterWrite(local, at, stored);
        }
    }

    // Within a class mv or fmv.s; across classes fmv.x.w or fmv.w.x (the bits unchanged).
    move(to, from) {
        if (to !== from) this.emit((to | from) < 32 ? instruction.i(0x13, to, 0, from, 0) : moveWord(to, from));
    }


    slot(depth) { return (this.slotBase ?? 0) + 4 * (this.locals + depth); }

    spill(depth, reg) {
        this.store(reg, this.slot(depth));
        this.spillDepth = Math.max(this.spillDepth, depth + 1);
    }

    // The operand's class is the scratch register's: an f32 consumer pops with an f scratch (ft10, ft11).
    pop(scratch) {
        if (!this.depth) throw new SyntaxError("empty RV32 operand stack");
        const depth = --this.depth;
        const home = this.direct[depth];
        if (home !== undefined) {
            this.direct[depth] = undefined;
            return home;
        }
        const reg = OPERAND_STACKS[scratch >> 5][depth];
        if (reg !== undefined) return reg;
        this.load(scratch, this.slot(depth));
        return scratch;
    }

    // classes[d]: the register class of the operand at depth d (a call spills and reloads by it).
    push(reg) {
        const depth = this.depth++;
        this.direct[depth] = undefined;
        this.classes[depth] = reg >> 5;
        const home = OPERAND_STACKS[reg >> 5][depth];
        if (home === undefined) this.spill(depth, reg);
        else this.move(home, reg);
    }

    // The register a result of class cls (0 integer, 1 float) is computed in.
    resultRegister(cls = 0) { return OPERAND_STACKS[cls][this.depth] ?? (cls ? FT10 : T5); }

}
