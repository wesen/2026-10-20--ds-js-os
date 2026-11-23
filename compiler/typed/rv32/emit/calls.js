// FunctionCode's calls and the callee-saved registers its prologue saves.
import {A0, FA0, FT10, T5, T6, OPERAND_STACKS, RA, calleeRegisters, calleeResults, isSavedRegister, stackWords,
    typeClass} from "../encoding/registers.js";
import {CALL, CELLS} from "../encoding/tape.js";

export class CallMethods {
    call(index) {
        const callee = this.functions[index], count = callee.params.length;
        // ilp32f: integer arguments in a0-a7, f32 in fa0-fa7, each popped from its class's operand stack; an f32
        // beyond fa7 in the next integer register; the rest in the stack words at sp + 4k (outgoingWords).
        const incoming = calleeRegisters(callee);
        for (let i = count - 1; i >= 0; i--) {
            const arg = incoming[i], cls = typeClass(callee.params[i]);
            if (arg >= 0 && arg >> 5 === cls) this.move(arg, this.pop(arg));
            else {
                const value = this.pop(cls ? FT10 : T5);
                if (arg >= 0) this.move(arg, value);
                else this.store(value, 4 * (-1 - arg));
            }
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
        // A record result's leaves, in order, from their registers and the stack words at sp + 4k.
        const results = calleeResults(callee);
        if (!results) return this.push(callee.result === "f32" ? FA0 : A0);
        for (let i = 0; i < results.length; i++) {
            const reg = results[i];
            if (reg >= 0) this.push(reg);
            else {
                const scratch = typeClass(callee.results[i]) ? FT10 : T5;
                this.load(scratch, 4 * (-1 - reg));
                this.push(scratch);
            }
        }
    }

    // The function's result into a0 or fa0, or a record result's leaves into their registers and the caller's stack
    // words (calleeResults). Pending direct reads move to the operand stack first, so no leaf's move overwrites a home
    // another leaf still reads (a leaf keeps its parameters in a0-a7 and fa0-fa7).
    returnValue() {
        const results = calleeResults(this.program);
        if (!results) return this.move(this.returnRegister, this.pop(this.returnRegister));
        this.materialize();
        if (results.stack) this.callerStack(T6);
        for (let i = results.length - 1; i >= 0; i--) {
            const reg = results[i];
            if (reg >= 0) this.move(reg, this.pop(reg));
            else this.store(this.pop(typeClass(this.program.results[i]) ? FT10 : T5), 4 * (-1 - reg), T6);
        }
    }


    // The words of the stack-argument area at the bottom of the frame: the most any call of this function passes on
    // the stack. A program none of whose functions takes a stack word skips the walk.
    outgoingWords() {
        const functions = this.functions;
        functions.stackWords ??= functions.reduce((most, fn) => Math.max(most, stackWords(fn)), 0);
        if (!functions.stackWords) return 0;
        const tape = this.program.code;
        let words = 0;
        for (let at = 0; at < tape.length; at += 1 + CELLS[tape[at]])
            if (tape[at] === CALL) words = Math.max(words, stackWords(functions[tape[at + 1]]));
        return words;
    }

    // reg = the caller's sp, where the incoming stack words are: a placeholder lower() patches once the frame is known.
    callerStack(reg) {
        this.usesFrame = true;
        (this.callerStacks ??= []).push({at: this.words.length, reg});
        this.emit(0);
    }

    // Callee-saved registers that the plan uses as homes, saved below the return address.
    savedRegisters() {
        const homes = this.locations?.homes;
        return homes ? [...new Set(homes.values())].filter(isSavedRegister).sort((a, b) => a - b) : [];
    }

}
