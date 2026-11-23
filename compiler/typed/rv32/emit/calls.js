// FunctionCode's calls and the callee-saved registers its prologue saves.
import {A0, STACK_REGISTERS, RA} from "../encoding/registers.js";
import {isSavedRegister} from "../plan/saved-homes.js";

export class CallMethods {
    call(index) {
        const count = this.functions[index].params.length;
        if (count > 8) throw new SyntaxError("RV32 supports up to eight register arguments");
        for (let i = count - 1; i >= 0; i--) {
            const arg = A0 + i;
            this.move(arg, this.pop(arg));
        }
        // Only the values below the arguments survive the call. A pending direct read stays in
        // its home: a function that calls keeps homes only in callee-saved registers.
        const live = Math.min(this.depth, STACK_REGISTERS.length);
        for (let d = 0; d < live; d++) if (this.direct[d] === undefined) this.spill(d, STACK_REGISTERS[d]);
        this.jump(this.starts[index], RA);
        for (let d = 0; d < live; d++) if (this.direct[d] === undefined) this.load(STACK_REGISTERS[d], this.slot(d));
        this.push(A0);
    }


    // Callee-saved registers that the plan uses as homes, saved below the return address.
    savedRegisters() {
        const homes = this.locations?.homes;
        return homes ? [...new Set(homes.values())].filter(isSavedRegister).sort((a, b) => a - b) : [];
    }

}
