    textRead(binding) {
        const index = this.pop(T5, true);
        const recv = binding >> 1;
        this.load(T6, 4 * recv);
        this.load(T6, 0, T6);
        this.emit(instruction.b(6, index, T6, 8)); // bltu: success skips ebreak
        this.emit(0x00100073);
        this.load(T6, 4 * recv);
        const out = this.resultRegister();
        this.emit(instruction.i(0x13, out, 1, index, 1)); // slli scales UTF-16 units
        this.emit(instruction.r(0x33, out, 0, T6, out));
        this.load(out, 4, out, 5);
        this.push(out);
    }
