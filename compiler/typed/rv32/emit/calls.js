// FunctionCode's calls and the callee-saved registers its prologue saves.
import {A0, FA0, OPERAND_STACKS, RA, calleeRegisters, isSavedRegister} from "../encoding/registers.js";

export class CallMethods {
    call(index) {
        const callee = this.functions[index], count = callee.params.length;
        // ilp32f: integer arguments in a0-a7, f32 in fa0-fa7, each popped from its class's operand stack.
        const incoming = calleeRegisters(callee);
        for (let i = count - 1; i >= 0; i--) {
            const arg = incoming[i];
            this.move(arg, this.pop(arg));
        }
        // Only the values below the arguments survive the call. A pending direct read stays in
        // its home: a function that calls keeps homes only in callee-saved registers.
        const live = Math.min(this.depth, OPERAND_STACKS[0].length);
        for (let d = 0; d < live; d++) if (this.direct[d] === undefined) this.spill(d, OPERAND_STACKS[this.classes[d]][d]);
        this.jump(this.starts[index], RA);
        for (let d = 0; d < live; d++) if (this.direct[d] === undefined) this.load(OPERAND_STACKS[this.classes[d]][d], this.slot(d));
        this.push(callee.result === "f32" ? FA0 : A0);
    }


    // Callee-saved registers that the plan uses as homes, saved below the return address.
    savedRegisters() {
        const homes = this.locations?.homes;
        return homes ? [...new Set(homes.values())].filter(isSavedRegister).sort((a, b) => a - b) : [];
    }

}
