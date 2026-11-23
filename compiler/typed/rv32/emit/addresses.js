// FunctionCode's checked and unchecked buffer addresses.
import {T6, A0, instruction} from "../encoding/registers.js";
import {I32_LOAD16_U} from "../encoding/tape.js";

export class AddressMethods {
    // The address of receiver[index + j]: checked against the capacity, or unchecked (UNCHECKED_ADDRESS, in a
    // copy of a loop that the version pass proved in range), and read at once when a UTF-16 load
    // follows.
    checkedAddress(receiver, index, constant, pointer, unchecked = false, j = 0) {
        const capacity = this.locations?.homes.get(-1 - receiver);
        const cached = this.locations?.receiver === receiver;
        const reload = !unchecked && capacity === undefined && (!cached || !this.capacityReady);
        const base = this.locations?.homes.get(receiver) ?? T6;
        if (base === T6 && (reload || !pointer)) this.readLocal(base, receiver);
        const length = capacity ?? (cached ? A0 + 7 : A0);
        if (reload) this.load(length, 0, base);
        if (!unchecked) {
            if (cached) this.capacityReady = true;
            this.emit(instruction.b(6, index, length, 8));
            this.emit(0x00100073);
        }
        const out = this.resultRegister(), tape = this.program.code;
        const loads = tape[this.at] === I32_LOAD16_U && tape[this.at+2] === 4;
        // select.loadHomes: a fused load whose value a homed local takes next loads into the
        // home (destination()), not into a stack register and a move. The address registers
        // are read by the load itself, so the home may be one of them.
        const fused = (offset, from) => {
            this.at += 3;
            const stored = this.select?.loadHomes ? this.destination() : undefined;
            this.load(stored ?? out, offset, from, 5);
            if (stored === undefined) this.push(out); else this.result(stored, stored);
        };
        if (pointer) {
            if (loads) return fused(pointer.disp, pointer.reg);
            this.emit(instruction.i(0x13, out, 0, pointer.reg, pointer.disp - 4));
        } else if (unchecked && j) {
            this.emit(instruction.i(0x13, out, 1, index, 1));
            this.emit(instruction.r(0x33, out, 0, base, out));
            if (loads && 4 + 2 * j <= 2047) return fused(4 + 2 * j, out);
            if (2 * j <= 2047) this.emit(instruction.i(0x13, out, 0, out, 2 * j));
            else {
                this.constant(T6, 2 * j);
                this.emit(instruction.r(0x33, out, 0, out, T6));
            }
        } else if (constant >= 0 && constant <= 1021 && loads) {
            return fused(4 + 2 * constant, base);
        } else {
            this.emit(instruction.i(0x13, out, 1, index, 1));
            this.emit(instruction.r(0x33, out, 0, base, out));
        }
        this.push(out);
    }

}
