// FunctionCode's checked and unchecked buffer addresses.
import {T5, T6, A0, SP, S0, ZERO, instruction} from "../encoding/registers.js";
import {I32_LOAD16_U} from "../encoding/tape.js";
import {LARGE_BASE} from "./stack.js";

export class AddressMethods {
    // reg = the address of frame byte `offset` (a local array's element): sp + offset, or s0 + offset - 2032 when a
    // large frame's offset is beyond sp's reach.
    frameAddress(reg, offset) {
        this.usesFrame = true;
        if (offset >= LARGE_BASE && this.large) this.emit(instruction.i(0x13, reg, 0, S0, offset - LARGE_BASE));
        else this.emit(instruction.i(0x13, reg, 0, SP, offset));
    }

    // Zero `bytes` frame bytes from `offset` (array.zero): one sw zero per word up to 16 words, else a loop of t5
    // from the first word to t6, the end.
    zeroFrame(offset, bytes) {
        if (bytes <= 64) {
            for (let k = 0; k < bytes; k += 4) this.store(ZERO, offset + k);
            return;
        }
        this.frameAddress(T5, offset);
        if (bytes < 2048) this.emit(instruction.i(0x13, T6, 0, T5, bytes));
        else {
            this.constant(T6, bytes);
            this.emit(instruction.r(0x33, T6, 0, T6, T5));
        }
        this.emit(instruction.s(2, T5, ZERO, 0));
        this.emit(instruction.i(0x13, T5, 0, T5, 4));
        this.emit(instruction.b(1, T5, T6, -8) >>> 0); // bne t5, t6, the sw
    }

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
