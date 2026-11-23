// FunctionCode's calls and the callee-saved registers its prologue saves.
import {A0, FA0, STACK_REGISTERS, RA, calleeRegisters, isSavedRegister} from "../encoding/registers.js";

export class CallMethods {
    call(index) {
        const callee = this.functions[index], count = callee.params.length;
        // ilp32f: integer arguments in a0-a7, f32 arguments in fa0-fa7. The operand stack holds every value in
        // an integer register (PICOCALC-TYPED-F32 decides otherwise), so an f32 argument moves across (fmv.w.x)
        // and an f32 result back (fmv.x.w). The registers are computed once per callee (registers.js).
        const incoming = calleeRegisters(callee);
        for (let i = count - 1; i >= 0; i--) {
            const arg = incoming[i];
            this.move(arg, this.pop(arg));
        }
        // Only the values below the arguments survive the call. A pending direct read stays in
        // its home: a function that calls keeps homes only in callee-saved registers.
        const live = Math.min(this.depth, STACK_REGISTERS.length);
        for (let d = 0; d < live; d++) if (this.direct[d] === undefined) this.spill(d, STACK_REGISTERS[d]);
        this.jump(this.starts[index], RA);
        for (let d = 0; d < live; d++) if (this.direct[d] === undefined) this.load(STACK_REGISTERS[d], this.slot(d));
        this.push(callee.result === "f32" ? FA0 : A0);
    }


    // Callee-saved registers that the plan uses as homes, saved below the return address.
    savedRegisters() {
        const homes = this.locations?.homes;
        return homes ? [...new Set(homes.values())].filter(isSavedRegister).sort((a, b) => a - b) : [];
    }

}
