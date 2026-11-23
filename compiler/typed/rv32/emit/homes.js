// FunctionCode's register homes: local reads and writes, direct reads, pointer homes.
import {OPERAND_STACKS, instruction, T6} from "../encoding/registers.js";
import {I32_CONST} from "../encoding/tape.js";

export class HomeMethods {
    readLocal(reg, local) {
        const home = this.locations?.homes.get(local);
        if (home !== undefined) this.move(reg, home);
        else this.load(reg, 4 * local);
    }

    writeLocal(reg, local) {
        const home = this.locations?.homes.get(local);
        if (home !== undefined) {
            // A pending read of this local must keep the value it had when it was pushed.
            this.materialize(home);
            this.move(home, reg);
        } else this.store(reg, 4 * local);
    }

    // Copy pending direct reads into their ordinary operand locations: every one, or only
    // those of one home register. Control flow calls this so that both arms of a join and
    // every loop iteration agree on where each operand lives.
    materialize(home) {
        for (let d = 0; d < this.depth; d++) {
            const h = this.direct[d];
            if (h === undefined || (home !== undefined && h !== home)) continue;
            this.direct[d] = undefined;
            const reg = OPERAND_STACKS[h >> 5][d];
            if (reg === undefined) this.spill(d, h);
            else this.move(reg, h);
        }
    }

    pushHome(home) {
        this.classes[this.depth] = home >> 5;
        this.direct[this.depth++] = home;
    }

    // The register class of a local: its type (fn.params, fn.localTypes); 0 throughout an integer function.
    localClass(local) {
        if (!this.floating) return 0;
        const fn = this.program, params = fn.params.length;
        return (local < params ? fn.params[local] : fn.localTypes?.[local - params]) === "f32" ? 1 : 0;
    }

    // p = r + 4 + 2(L + K0), or r + 4 + 2(L + M) when other holds M, for a pointer home
    // (operandLocations.pointers). base is read after value and other.
    pointerFrom(p, value, base, K0, other) {
        const offset = (4 + 2 * K0) | 0;
        if (other === undefined) this.emit(instruction.i(0x13, p, 1, value, 1));
        else {
            this.emit(instruction.r(0x33, p, 0, value, other));
            this.emit(instruction.i(0x13, p, 1, p, 1));
        }
        if (base === undefined) {
            base = T6;
            this.readLocal(T6, this.pendingBase);
        }
        this.emit(instruction.r(0x33, p, 0, p, base));
        if (offset >= -2048 && offset <= 2047) {
            if (offset) this.emit(instruction.i(0x13, p, 0, p, offset));
        } else {
            this.constant(T6, offset);
            this.emit(instruction.r(0x33, p, 0, p, T6));
        }
    }

    // After a write of local: keep every pointer home derived from it current.
    pointersAfterWrite(local, at, value) {
        const plan = this.locations, list = plan?.pointerWrites?.get(local);
        if (!list) return;
        const source = plan.homes.get(local) ?? value;
        const step = plan.increments.get(at);
        // A constant written to the source: the pointer is base + 4 + 2 * (K0 + c), one addition.
        // The constant is the operation before the set, or the current one when destination()
        // folded the set into it.
        const tape = this.program.code;
        let constant;
        if (plan.skips) for (const o of [this.currentOp, this.previousOp]) if (o !== undefined && tape[o] === I32_CONST && o + 2 === at) constant = tape[o + 1];
        for (const {reg, r, K0, other} of list) {
            if (step !== undefined) {
                this.emit(instruction.i(0x13, reg, 0, reg, 2 * step));
                continue;
            }
            const base = plan.homes.get(r), offset = 4 + 2 * (K0 + (constant ?? 0));
            if (constant !== undefined && other === undefined && base !== undefined && offset >= -2048 && offset <= 2047) {
                this.emit(instruction.i(0x13, reg, 0, base, offset));
                continue;
            }
            let second;
            if (other !== undefined) {
                second = plan.homes.get(other);
                if (second === undefined) {
                    this.readLocal(T6, other);
                    second = T6;
                }
            }
            // An unhomed receiver is loaded into t6 once value and other are consumed.
            this.pendingBase = r;
            this.pointerFrom(reg, source, plan.homes.get(r), K0, second);
        }
    }

}
