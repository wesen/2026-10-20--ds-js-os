    textRead(binding) {
        const index = this.pop(T5, true);
        const recv = binding >> 1;
        const header = this.readLocal(recv, T6);
        this.load(T6, 0, header);
        this.emit(instruction.b(6, index, T6, 8)); // bltu: success skips ebreak
        this.emit(0x00100073);
        const base = header === T6 ? this.readLocal(recv, T6) : header;
        const out = this.resultRegister();
        const scaled = out === base ? T5 : out;
        this.emit(instruction.i(0x13, scaled, 1, index, 1));
        this.emit(instruction.r(0x33, out, 0, base, scaled));
        this.load(out, 4, out, 5);
        this.push(out);
    }
