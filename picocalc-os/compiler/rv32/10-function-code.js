class FunctionCode {
    constructor(program, functions, starts) {
        this.program = program;
        this.functions = functions;
        this.starts = starts;
        this.locals = program.params.length + program.nlocals;
        this.words = [];
        this.calls = [];
        this.control = [];
        this.depth = this.spillDepth = this.at = 0;
        // direct[d] names the home register of a local read that is still pending at operand
        // depth d. Its consumer reads the home itself, so no copy is emitted.
        this.direct = [];
        this.exit = {};
        if (program.nativeInspection) observeSteps(this);
    }

    cell() { return this.program.code[this.at++]; }

    emit(word) { this.words.push(word >>> 0); }
    load(reg, offset, base = SP, kind = 2) {
        this.emit(instruction.i(0x03, reg, kind, base, offset));
    }

    store(reg, offset, base = SP, kind = 2) {
        this.emit(instruction.s(kind, base, reg, offset));
    }

    constant(reg, n) {
        const lo = (n << 20) >> 20;
        if (n !== lo) this.emit(((n - lo) & 0xfffff000) | (reg << 7) | 0x37);
        if (n === lo || lo !== 0 || !this.select?.immediates)
            this.emit(instruction.i(0x13, reg, 0, n === lo ? ZERO : reg, lo));
    }

    // select.results: when the next operation stores this result into a homed local, the
    // result is computed in the home and the store disappears. Call after popping the
    // operands; every caller's sequence reads its operands no later than its first write.
    destination() {
        const tape = this.program.code, plan = this.locations;
        if (!this.select?.results || !plan || tape[this.at] !== 0x21 || plan.forward.has(this.at)) return undefined;
        const home = plan.homes.get(tape[this.at + 1]);
        if (home === undefined) return undefined;
        this.pendingWrite = [tape[this.at + 1], this.at];
        this.at += 2;
        this.materialize(home);
        return home;
    }

    // Push a result computed in resultRegister(), unless destination() stored it already.
    result(out, stored) {
        if (stored === undefined) this.push(out);
        else if (this.pendingWrite) {
            const [local, at] = this.pendingWrite;
            this.pendingWrite = undefined;
            this.pointersAfterWrite(local, at, stored);
        }
    }

    move(to, from) {
        if (to !== from) this.emit(instruction.i(0x13, to, 0, from, 0));
    }

    readLocal(reg, local) {
        const home = this.locations?.homes.get(local);
        if (home !== undefined) this.move(reg, home);
        else this.load(reg, 4 * local);
    }

    writeLocal(reg, local) {
        const home = this.locations?.homes.get(local);
        if (home !== undefined) {
            // A pending read of this local must keep the value it had when it was pushed.
            this.materialize(home);
            this.move(home, reg);
        } else this.store(reg, 4 * local);
    }

    // Copy pending direct reads into their ordinary operand locations: every one, or only
    // those of one home register. Control flow calls this so that both arms of a join and
    // every loop iteration agree on where each operand lives.
    materialize(home) {
        for (let d = 0; d < this.depth; d++) {
            const h = this.direct[d];
            if (h === undefined || (home !== undefined && h !== home)) continue;
            this.direct[d] = undefined;
            const reg = STACK_REGISTERS[d];
            if (reg === undefined) this.spill(d, h);
            else this.move(reg, h);
        }
    }

    pushHome(home) {
        this.direct[this.depth++] = home;
    }

    // p = r + 4 + 2(L + K0), or r + 4 + 2(L + M) when other holds M, for a pointer home
    // (operandLocations.pointers). base is read after value and other.
    pointerFrom(p, value, base, K0, other) {
        const offset = (4 + 2 * K0) | 0;
        if (other === undefined) this.emit(instruction.i(0x13, p, 1, value, 1));
        else {
            this.emit(instruction.r(0x33, p, 0, value, other));
            this.emit(instruction.i(0x13, p, 1, p, 1));
        }
        if (base === undefined) {
            base = T6;
            this.readLocal(T6, this.pendingBase);
        }
        this.emit(instruction.r(0x33, p, 0, p, base));
        if (offset >= -2048 && offset <= 2047) {
            if (offset) this.emit(instruction.i(0x13, p, 0, p, offset));
        } else {
            this.constant(T6, offset);
            this.emit(instruction.r(0x33, p, 0, p, T6));
        }
    }

    // After a write of local: keep every pointer home derived from it current.
    pointersAfterWrite(local, at, value) {
        const plan = this.locations, list = plan?.pointerWrites?.get(local);
        if (!list) return;
        const source = plan.homes.get(local) ?? value;
        const step = plan.increments.get(at);
        // A constant written to the source: the pointer is base + 4 + 2 * (K0 + c), one addition.
        // The constant is the operation before the set, or the current one when destination()
        // folded the set into it.
        const tape = this.program.code;
        let constant;
        if (plan.skips) for (const o of [this.currentOp, this.previousOp]) if (o !== undefined && tape[o] === 0x41 && o + 2 === at) constant = tape[o + 1];
        for (const {reg, r, K0, other} of list) {
            if (step !== undefined) {
                this.emit(instruction.i(0x13, reg, 0, reg, 2 * step));
                continue;
            }
            const base = plan.homes.get(r), offset = 4 + 2 * (K0 + (constant ?? 0));
            if (constant !== undefined && other === undefined && base !== undefined && offset >= -2048 && offset <= 2047) {
                this.emit(instruction.i(0x13, reg, 0, base, offset));
                continue;
            }
            let second;
            if (other !== undefined) {
                second = plan.homes.get(other);
                if (second === undefined) {
                    this.readLocal(T6, other);
                    second = T6;
                }
            }
            // An unhomed receiver is loaded into t6 once value and other are consumed.
            this.pendingBase = r;
            this.pointerFrom(reg, source, plan.homes.get(r), K0, second);
        }
    }

    // The address of receiver[index + j]: checked against the capacity, or unchecked (0xf3, in a
    // copy of a loop that select.version proved in range), and read at once when a UTF-16 load
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
        const loads = tape[this.at] === 0x2f && tape[this.at+2] === 4;
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

    slot(depth) { return 4 * (this.locals + depth); }

    spill(depth, reg) {
        this.store(reg, this.slot(depth));
        this.spillDepth = Math.max(this.spillDepth, depth + 1);
    }

    pop(scratch) {
        if (!this.depth) throw new SyntaxError("empty RV32 operand stack");
        const depth = --this.depth;
        const home = this.direct[depth];
        if (home !== undefined) {
            this.direct[depth] = undefined;
            return home;
        }
        const reg = STACK_REGISTERS[depth];
        if (reg !== undefined) return reg;
        this.load(scratch, this.slot(depth));
        return scratch;
    }

    push(reg) {
        const depth = this.depth++;
        this.direct[depth] = undefined;
        const home = STACK_REGISTERS[depth];
        if (home === undefined) this.spill(depth, reg);
        else this.move(home, reg);
    }

    resultRegister() { return STACK_REGISTERS[this.depth] ?? T5; }

    // A conditional branch skips the fixed-width jump when the predicate is false.
    branch(kind, a, b, target) {
        if (this.select?.branches && target.at !== undefined) {
            const offset = 4 * (target.at - this.words.length);
            if (offset >= -4096) {
                this.emit(instruction.b(kind, a, b, offset) >>> 0);
                return;
            }
        }
        // select.shortBranches: a forward branch is one conditional branch, patched once the
        // function is complete; patchBranches() asks for a long-branch lowering if any
        // target is beyond the 4 KiB range.
        if (this.select?.shortBranches && !this.longBranches) {
            (this.shortBranches ??= []).push({from: this.words.length, target, kind, a, b});
            this.emit(0);
            return;
        }
        this.emit(instruction.b(kind ^ 1, a, b, 8));
        this.jump(target);
    }

    patchBranches() {
        for (const {from, target, kind, a, b} of this.shortBranches ?? []) {
            const offset = 4 * (target.at - from);
            if (!(offset <= 4094)) throw SHORT_BRANCH_RANGE;
            this.words[from] = instruction.b(kind, a, b, offset) >>> 0;
        }
    }

    jump(target, rd = ZERO) {
        this.calls.push({from: this.words.length, target, rd});
        this.emit(0);
    }

    mark(label) { label.at = this.words.length; }

    binary(op) {
        const b = this.pop(T6);
        const a = this.pop(T5);
        const stored = this.destination();
        const out = stored ?? this.resultRegister();
        const alu = ALU.get(op);
        if (alu) {
            if (op === 0x6d || op === 0x6f) {
                this.emit(instruction.b(1, b, ZERO, 8));
                this.emit(0x00100073);
            }
            if (op === 0x6d) {
                const safe = {};
                // A frameless function still keeps its parameters in argument registers.
                const check = this.frameless ? T5 : A0;
                this.constant(check, -1);
                this.branch(1, b, check, safe);
                this.constant(check, -2147483648);
                this.emit(instruction.b(1, a, check, 8));
                this.emit(0x00100073);
                this.mark(safe);
            }
            this.emit(instruction.r(0x33, out, alu[0], a, b, alu[1]));
        } else if (op === 0x46 || op === 0x47) {
            this.emit(instruction.r(0x33, out, 4, a, b)); // xor
            if (op === 0x46) this.emit(instruction.i(0x13, out, 3, out, 1)); // seqz
            else this.emit(instruction.r(0x33, out, 3, ZERO, out)); // snez
        } else {
            const unsigned = op === 0x4f;
            if (![0x48, 0x4a, 0x4c, 0x4e, 0x4f].includes(op))
                throw new SyntaxError("unsupported RV32 operator " + op);
            const swap = op === 0x4a || op === 0x4c;
            this.emit(instruction.r(0x33, out, unsigned ? 3 : 2, swap ? b : a, swap ? a : b));
            if (op === 0x4c || op === 0x4e || unsigned)
                this.emit(instruction.i(0x13, out, 4, out, 1));
        }
        this.result(out, stored);
    }

    // select.immediates and select.divisions: the literal at this.at feeds the next operation.
    selectConstant() {
        const tape = this.program.code, c = tape[this.at], next = tape[this.at + 1];
        const kind = constantForm(tape, this.at, this.select);
        if (kind === "register") return false;
        if (kind === "zero") {
            this.at++;
            this.pushHome(ZERO);
            return true;
        }
        if (kind === "divide") {
            const nonNegative = this.facts?.has(this.at + 1) ?? false;
            this.at += 2;
            this.divideByConstant(next === 0x6f, c, nonNegative);
            return true;
        }
        const form = IMMEDIATE_FORMS.get(next)(c);
        this.at += 2;
        const a = this.pop(T5);
        const stored = this.destination();
        const out = stored ?? this.resultRegister();
        form.forEach(([f3, imm], i) => this.emit(instruction.i(0x13, out, f3, i ? out : a, imm)));
        this.result(out, stored);
        return true;
    }

    // Signed truncating division or remainder by a positive constant, without a divide.
    // T6 is the scratch register; pop(T5) never returns it.
    // nonNegative (select.facts): the dividend is known >= 0, so no rounding bias or sign
    // correction is needed: a shift, a mask, or the multiply-high and its shift alone.
    divideByConstant(remainder, d, nonNegative = false) {
        const a = this.pop(T5);
        const stored = this.destination();
        const out = stored ?? this.resultRegister();
        const k = powerOfTwo(d);
        if (k === 0) this.move(out, a);
        else if (k > 0 && nonNegative) {
            if (!remainder) this.emit(instruction.i(0x13, out, 5, a, 0x400 | k));       // srai out,a,k
            else if (fitsImmediate(d - 1)) this.emit(instruction.i(0x13, out, 7, a, d - 1)); // andi out,a,d-1
            else {
                this.emit(instruction.i(0x13, out, 1, a, 32 - k));                       // slli out,a,32-k
                this.emit(instruction.i(0x13, out, 5, out, 32 - k));                     // srli out,out,32-k
            }
        } else if (k > 0) {
            // Bias a negative dividend by d - 1 so that the shift rounds toward zero.
            if (k === 1) this.emit(instruction.i(0x13, T6, 5, a, 31));         // srli t6,a,31
            else {
                this.emit(instruction.i(0x13, T6, 5, a, 0x400 | 31));         // srai t6,a,31
                this.emit(instruction.i(0x13, T6, 5, T6, 32 - k));            // srli t6,t6,32-k
            }
            if (remainder) {
                this.emit(instruction.r(0x33, T6, 0, a, T6));                 // add t6,a,t6
                if (fitsImmediate(-d)) this.emit(instruction.i(0x13, T6, 7, T6, -d)); // andi
                else {
                    this.emit(instruction.i(0x13, T6, 5, T6, 0x400 | k));
                    this.emit(instruction.i(0x13, T6, 1, T6, k));
                }
                this.emit(instruction.r(0x33, out, 0, a, T6, 0x20));          // sub out,a,t6
            } else {
                this.emit(instruction.r(0x33, out, 0, a, T6));                // add out,a,t6
                this.emit(instruction.i(0x13, out, 5, out, 0x400 | k));       // srai out,out,k
            }
        } else {
            const {magic, shift} = divisionMagic(d);
            this.constant(T6, magic);
            this.emit(instruction.r(0x33, T6, 1, a, T6, 1));                  // mulh t6,a,t6
            if (magic < 0) this.emit(instruction.r(0x33, T6, 0, T6, a));      // add t6,t6,a
            if (nonNegative) {
                // The quotient's correction adds the dividend's sign bit, 0 here.
                if (shift) this.emit(instruction.i(0x13, out, 5, T6, 0x400 | shift));
                else this.move(out, T6);
            } else {
                if (shift) this.emit(instruction.i(0x13, T6, 5, T6, 0x400 | shift));
                this.emit(instruction.i(0x13, out, 5, a, 31));                // srli out,a,31
                this.emit(instruction.r(0x33, out, 0, out, T6));              // add out,out,t6
            }
        }
        this.result(out, stored);
    }

    // Whether the operation at `at` (after a predicate) is a branch the predicate can fuse with.
    fusible(at) {
        const tape = this.program.code;
        const consumer = tape[at] === 0x45 ? tape[at + 1] : tape[at];
        return consumer === 0x04 || consumer === 0x0d;
    }

    branchTarget() {
        const block = this.control.at(-1 - this.cell());
        return block.op === 0x03 ? block.start : block.end;
    }

    // select.branches: a comparison consumed by if or br_if becomes one conditional branch.
    fuseBranch(op) {
        const encoding = PREDICATES.get(op);
        if (!encoding || !this.fusible(this.at)) return false;
        const negate = this.program.code[this.at] === 0x45;
        const consumer = this.program.code[this.at + Number(negate)];
        this.at += 1 + Number(negate);
        const [kind, swap] = encoding;
        const right = op === 0x45 ? ZERO : this.pop(T6);
        const left = this.pop(T5);
        // As at every control operation, pending direct reads move to their stack registers.
        this.materialize();
        const a = swap ? right : left;
        const b = swap ? left : right;
        const whenTrue = kind ^ Number(negate);
        if (consumer === 0x04) this.begin(consumer, whenTrue ^ 1, a, b);
        else this.branch(whenTrue, a, b, this.branchTarget());
        return true;
    }

    begin(op, kind = 0, a, b = ZERO) {
        const type = this.cell();
        if (type !== 0x40 && type !== 0x7f) throw new SyntaxError("unsupported RV32 control result");
        const condition = op === 0x04 ? a ?? this.pop(T5) : ZERO;
        const block = {op, depth: this.depth, value: type === 0x7f, start: {}, alternate: {}, end: {}};
        this.control.push(block);
        this.mark(block.start);
        if (op === 0x04) this.branch(kind, condition, b, block.alternate);
    }

    end() {
        const block = this.control.pop();
        if (!block) {
            this.move(A0, this.pop(A0));
            return true;
        }
        if (block.alternate.at === undefined) this.mark(block.alternate);
        this.mark(block.end);
        // Both arms put a result in the same home at the block's entry depth.
        this.depth = block.depth + Number(block.value);
        return false;
    }

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

    step(op) {
        const plan = this.locations;
        this.previousOp = this.currentOp;
        this.currentOp = this.at - 1;
        const skip = plan?.skips?.get(this.at - 1);
        if (skip) {
            for (const {reg} of plan.pointerWrites.get(skip.local)) this.emit(instruction.i(0x13, reg, 0, reg, 2 * skip.inc));
            this.at = skip.end;
            this.currentOp = undefined;
            return false;
        }
        if (op >= 0x02 && op <= 0x0f) this.materialize();
        if (plan?.forward.has(this.at - 1)) {
            const site = this.at - 1, tape = this.program.code;
            const constant = op === 0x41 ? this.cell() : undefined;
            // [const c] set t access r t, or set t access r t: access is 0xf1 or 0xf3 (with j).
            const accessAt = constant === undefined ? site + 2 : site + 4;
            const unchecked = tape[accessAt] === 0xf3, j = unchecked ? tape[accessAt + 3] : 0;
            const direct = unchecked && constant >= 0 && constant + j <= 1021 && tape[accessAt + 4] === 0x2f && tape[accessAt + 6] === 4;
            const constantHome = constant === undefined ? undefined : plan.homes.get("c" + constant);
            const index = constant === undefined ? this.pop(T5) : constantHome ?? T5;
            if (constant !== undefined) {
                if (constantHome === undefined && !direct) this.constant(index, constant);
                this.at++; // local.set opcode following the literal
            }
            this.at += 2; // destination local and checked-address opcode
            const receiver = this.cell();
            this.at++; // proven single-use index local
            if (unchecked) this.at++; // j
            this.checkedAddress(receiver, index, constant === undefined ? undefined : constant + j,
                constant === undefined ? plan.pointers?.get(site) : undefined, unchecked, constant === undefined ? j : 0);
            return false;
        }
        // The capacity header of a buffer with a capacity home: the home itself.
        if (op === 0x20 && plan && this.select?.version && this.program.code[this.at + 1] === 0x28 && this.program.code[this.at + 3] === 0) {
            const home = plan.homes.get(-1 - this.program.code[this.at]);
            if (home !== undefined) {
                this.at += 4;
                this.pushHome(home);
                return false;
            }
        }
        if (op === 0x20 && this.capacityReady && this.program.code[this.at] === plan.receiver &&
            this.program.code[this.at+1] === 0x28 && this.program.code[this.at+3] === 0) {
            this.at += 4;
            this.push(A0 + 7);
            return false;
        }
        if (this.select?.branches && op >= 0x45 && op <= 0x4f && this.fuseBranch(op)) return false;
        if (op === 0x41 && this.select && this.selectConstant()) return false;
        switch (op) {
        case 0x00: this.emit(0x00100073); break;  // Wasm unreachable
        case 0x02: case 0x03: case 0x04: this.begin(op); break;
        case 0x05: {
            const block = this.control.at(-1);
            this.jump(block.end);
            this.mark(block.alternate);
            this.depth = block.depth;
            break;
        }
        case 0x0b: return this.end();
        case 0x0c: case 0x0d: {
            const block = this.control.at(-1 - this.cell());
            const target = block.op === 0x03 ? block.start : block.end;
            if (op === 0x0d) this.branch(1, this.pop(T5), ZERO, target);
            else this.jump(target);
            break;
        }
        case 0x0f: this.move(A0, this.pop(A0)); this.jump(this.exit); break;
        case 0x10: this.call(this.cell()); break;
        case 0x1a: this.depth--; break;
        case 0x20: {
            const local = this.cell();
            const home = plan?.direct ? plan.homes.get(local) : undefined;
            if (home !== undefined) {
                this.pushHome(home);
                break;
            }
            const stored = this.destination();
            const out = stored ?? this.resultRegister();
            this.readLocal(out, local);
            this.result(out, stored);
            break;
        }
        case 0x21: {
            const value = this.pop(T5), local = this.cell();
            this.writeLocal(value, local);
            this.pointersAfterWrite(local, this.at - 2, value);
            break;
        }
        case 0x28: case 0x2f: case 0x36: case 0x3b: {
            this.cell(); // alignment hint
            const offset = this.cell();
            if (offset > 2047) throw new SyntaxError("RV32 field offset exceeds the instruction range");
            if (op === 0x28 || op === 0x2f) {
                const base = this.pop(T5);
                const stored = this.destination();
                const out = stored ?? this.resultRegister();
                this.load(out, offset, base, op === 0x28 ? 2 : 5); // lw or lhu
                this.result(out, stored);
            } else {
                const value = this.pop(T6);
                this.store(value, offset, this.pop(T5), op === 0x36 ? 2 : 1); // sw or sh
            }
            break;
        }
        case 0x41: {
            const n = this.cell();
            const constantHome = plan?.homes.get("c" + n);
            if (constantHome !== undefined) {
                this.pushHome(constantHome);
                break;
            }
            const stored = this.destination();
            const out = stored ?? this.resultRegister();
            this.constant(out, n);
            this.result(out, stored);
            break;
        }
        case 0x45: {
            const value = this.pop(T5);
            const stored = this.destination();
            const out = stored ?? this.resultRegister();
            this.emit(instruction.i(0x13, out, 3, value, 1));
            this.result(out, stored);
            break;
        }
        case 0xf1: { // checked UTF-16 address, before any payload load or write RHS
            const receiver = this.cell(), position = this.cell();
            this.readLocal(T5, position);
            this.checkedAddress(receiver, T5);
            break;
        }
        case 0xf3: { // unchecked UTF-16 address of receiver[position + j] (select.version)
            const receiver = this.cell(), position = this.cell(), j = this.cell();
            this.readLocal(T5, position);
            this.checkedAddress(receiver, T5, undefined, undefined, true, j);
            break;
        }
        case 0xf2: { // ordered UTF-16 stores after the complete range check
            const address = this.cell();
            const value = this.program.literals[this.cell()];
            this.readLocal(T5, address);
            for (let i = 0; i < value.length; i++) {
                this.constant(T6, value.charCodeAt(i));
                this.store(T6, 4 + 2 * i, T5, 1);
            }
            break;
        }
        default: this.binary(op);
        }
        return false;
    }

    // Callee-saved registers that the plan uses as homes, saved below the return address.
    savedRegisters() {
        const homes = this.locations?.homes;
        return homes ? [...new Set(homes.values())].filter(isSavedRegister).sort((a, b) => a - b) : [];
    }

    lower() {
        const count = this.program.params.length;
        if (count > 8) throw new SyntaxError("RV32 supports up to eight register arguments");
        const saved = this.savedRegisters();
        // The frame size depends on the deepest spill, known only after the body, so the
        // prologue is emitted as placeholders and patched below.
        this.emit(0);
        this.emit(0);
        for (let k = 0; k < saved.length; k++) this.emit(0);
        for (let i = 0; i < count; i++) this.writeLocal(A0 + i, i);
        // Capacity homes belong to unwritten parameters, still in their argument registers here.
        for (const [id, reg] of this.locations?.homes ?? []) {
            if (typeof id === "string") {
                if (id[0] === "c") this.constant(reg, Number(id.slice(1)));
            } else if (id < 0) this.load(reg, 0, A0 - 1 - id);
        }
        // Pointer homes of parameters, from the incoming argument registers.
        for (const [local, list] of this.locations?.pointerWrites ?? [])
            if (local < count) for (const {reg, r, K0, other} of list) {
                if (other === undefined) this.pointerFrom(reg, A0 + local, A0 + r, K0);
                else if (other < count && local < other) this.pointerFrom(reg, A0 + local, A0 + r, K0, A0 + other);
            }
        while (this.at < this.program.code.length && !this.step(this.cell())) {}
        const frame = (4 * (this.locals + this.spillDepth + saved.length + 1) + 15) & -16;
        if (frame > 2032) throw new SyntaxError("RV32 function frame exceeds the instruction range");
        this.words[0] = instruction.i(0x13, SP, 0, SP, -frame) >>> 0;
        this.words[1] = instruction.s(2, SP, RA, frame - 4) >>> 0;
        for (let k = 0; k < saved.length; k++)
            this.words[2 + k] = instruction.s(2, SP, saved[k], frame - 8 - 4 * k) >>> 0;
        // Every return jumps here, so one restore sequence covers all exits.
        this.mark(this.exit);
        for (let k = 0; k < saved.length; k++) this.load(saved[k], frame - 8 - 4 * k);
        this.load(RA, frame - 4);
        this.emit(instruction.i(0x13, SP, 0, SP, frame));
        this.emit(instruction.i(0x67, ZERO, 0, RA, 0));
        this.patchBranches();
        return this;
    }
}

