    textReadTemp() { return DIRECT_READ ? -1 : this.nextLocal++; }

    // The receiver low bit identifies a buffer capacity, otherwise a string length.
    textRead(binding, pos) {
        this.code.push(TYPED_READ, binding.index * 2 + Number(binding.type === "buffer"));
        if (!DIRECT_READ) this.code.push(pos);
        this.hasTypedOperations = true;
    }

    emitBinary(op) {
        this.code.push(op);
        if (op === 0x46 || (op >= 0x48 && op <= 0x4e))
            this.comparisonAt = this.code.length - 1;
    }

    branchIf(type) {
        if (!this.packPredicate(OP.if, type)) super.branchIf(type);
    }

    exitWhile() {
        if (!this.packPredicate(0x0d, 1)) super.exitWhile();
    }

    packPredicate(consumer, operand) {
        const end = this.code.length - 1;
        const negated = this.comparisonAt === end - 1 && this.code[end] === OP.eqz;
        if (!negated && this.comparisonAt !== end) return false;
        const op = this.code[this.comparisonAt];
        this.code.length = this.comparisonAt;
        const invert = Number(consumer === 0x0d) + Number(negated);
        // While contributes its own eqz in addition to any source-level !.
        this.code.push(TYPED_PREDICATE, op, invert, consumer, operand);
        this.comparisonAt = -1;
        this.hasTypedOperations = true;
        return true;
    }

    finish(fn) {
        if (this.hasTypedOperations) fn.hasTypedOperations = true;
        return fn;
    }
