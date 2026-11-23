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
        // An operand deeper than its class's stack registers is in its slot already.
        const live = this.depth, direct = this.direct, classes = this.classes;
        for (let d = 0; d < live; d++) {
            const reg = direct[d] === undefined ? OPERAND_STACKS[classes[d]][d] : undefined;
            if (reg !== undefined) this.spill(d, reg);
        }
        this.usesFrame = true; // the return address
        this.jump(this.starts[index], RA);
        for (let d = 0; d < live; d++) {
            const reg = direct[d] === undefined ? OPERAND_STACKS[classes[d]][d] : undefined;
            if (reg !== undefined) this.load(reg, this.slot(d));
        }
        this.push(callee.result === "f32" ? FA0 : A0);
    }


    // Callee-saved registers that the plan uses as homes, saved below the return address.
    savedRegisters() {
        const homes = this.locations?.homes;
        return homes ? [...new Set(homes.values())].filter(isSavedRegister).sort((a, b) => a - b) : [];
    }

}
