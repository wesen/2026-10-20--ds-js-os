// FunctionCode, the streaming emitter: one pass over a function's tape that writes RV32 words.
import {AddressMethods} from "./addresses.js";
import {ArithmeticMethods} from "./arithmetic.js";
import {BranchMethods} from "./branches.js";
import {CallMethods} from "./calls.js";
import {FloatMethods, FLOAT_OPERATIONS} from "./floats.js";
import {HomeMethods} from "./homes.js";
import {observeSteps} from "./inspection.js";
import {mixin} from "./mixin.js";
import {StackMethods} from "./stack.js";
import {instruction, T5, A0, FA0, FT10, ZERO, T6, SP, RA, calleeRegisters} from "../encoding/registers.js";
import {storeWord} from "../encoding/instructions.js";
import {BLOCK, RETURN, I32_CONST, UNCHECKED_ADDRESS, I32_LOAD16_U, LOCAL_GET, I32_LOAD, I32_EQZ, I32_GE_U, UNREACHABLE, LOOP, IF, ELSE, END, BR, BR_IF, CALL, DROP, LOCAL_SET, I32_STORE, I32_STORE16, CHECKED_ADDRESS, LITERAL_STORES} from "../encoding/tape.js";

export class FunctionCode {
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
        this.classes = [];
        this.exit = {};
        // ilp32f: an f32 result returns in fa0, every other in a0.
        this.returnRegister = program.result === "f32" ? FA0 : A0;
        if (program.nativeInspection) observeSteps(this);
    }

    cell() { return this.program.code[this.at++]; }

    emit(word) { this.words.push(word >>> 0); }

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
        if (op >= BLOCK && op <= RETURN) this.materialize();
        if (plan?.forward.has(this.at - 1)) {
            const site = this.at - 1, tape = this.program.code;
            const constant = op === I32_CONST ? this.cell() : undefined;
            // [const c] set t access r t, or set t access r t: access is CHECKED_ADDRESS or UNCHECKED_ADDRESS (with j).
            const accessAt = constant === undefined ? site + 2 : site + 4;
            const unchecked = tape[accessAt] === UNCHECKED_ADDRESS, j = unchecked ? tape[accessAt + 3] : 0;
            const direct = unchecked && constant >= 0 && constant + j <= 1021 && tape[accessAt + 4] === I32_LOAD16_U && tape[accessAt + 6] === 4;
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
        if (op === LOCAL_GET && plan && this.versioned && this.program.code[this.at + 1] === I32_LOAD && this.program.code[this.at + 3] === 0) {
            const home = plan.homes.get(-1 - this.program.code[this.at]);
            if (home !== undefined) {
                this.at += 4;
                this.pushHome(home);
                return false;
            }
        }
        if (op === LOCAL_GET && this.capacityReady && this.program.code[this.at] === plan.receiver &&
            this.program.code[this.at+1] === I32_LOAD && this.program.code[this.at+3] === 0) {
            this.at += 4;
            this.push(A0 + 7);
            return false;
        }
        if (this.select?.branches && op >= I32_EQZ && op <= I32_GE_U && this.fuseBranch(op)) return false;
        if (op === I32_CONST && this.select && this.selectConstant()) return false;
        switch (op) {
        case UNREACHABLE: this.emit(0x00100073); break;  // Wasm unreachable
        case BLOCK: case LOOP: case IF: this.begin(op); break;
        case ELSE: {
            const block = this.control.at(-1);
            this.jump(block.end);
            this.mark(block.alternate);
            this.depth = block.depth;
            break;
        }
        case END: return this.end();
        case BR: case BR_IF: {
            const block = this.control.at(-1 - this.cell());
            const target = block.op === LOOP ? block.start : block.end;
            if (op === BR_IF) this.branch(1, this.pop(T5), ZERO, target);
            else this.jump(target);
            break;
        }
        case RETURN: this.move(this.returnRegister, this.pop(this.returnRegister)); this.jump(this.exit); break;
        case CALL: this.call(this.cell()); break;
        case DROP: this.depth--; break;
        case LOCAL_GET: {
            const local = this.cell();
            const home = plan?.direct ? plan.homes.get(local) : undefined;
            if (home !== undefined) {
                this.pushHome(home);
                break;
            }
            const stored = this.destination();
            const out = stored ?? this.resultRegister(this.localClass(local));
            this.readLocal(out, local);
            this.result(out, stored);
            break;
        }
        case LOCAL_SET: {
            const value = this.pop(this.localClass(this.program.code[this.at]) ? FT10 : T5), local = this.cell();
            this.writeLocal(value, local);
            this.pointersAfterWrite(local, this.at - 2, value);
            break;
        }
        case I32_LOAD: case I32_LOAD16_U: case I32_STORE: case I32_STORE16: {
            this.cell(); // alignment hint
            const offset = this.cell();
            if (offset > 2047) throw new SyntaxError("RV32 field offset exceeds the instruction range");
            if (op === I32_LOAD || op === I32_LOAD16_U) {
                const base = this.pop(T5);
                const stored = this.destination();
                const out = stored ?? this.resultRegister();
                this.load(out, offset, base, op === I32_LOAD ? 2 : 5); // lw or lhu
                this.result(out, stored);
            } else {
                const value = this.pop(T6);
                this.store(value, offset, this.pop(T5), op === I32_STORE ? 2 : 1); // sw or sh
            }
            break;
        }
        case I32_CONST: {
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
        case I32_EQZ: {
            const value = this.pop(T5);
            const stored = this.destination();
            const out = stored ?? this.resultRegister();
            this.emit(instruction.i(0x13, out, 3, value, 1));
            this.result(out, stored);
            break;
        }
        case CHECKED_ADDRESS: { // checked UTF-16 address, before any payload load or write RHS
            const receiver = this.cell(), position = this.cell();
            this.readLocal(T5, position);
            this.checkedAddress(receiver, T5);
            break;
        }
        case UNCHECKED_ADDRESS: { // unchecked UTF-16 address of receiver[position + j] (the version pass)
            const receiver = this.cell(), position = this.cell(), j = this.cell();
            this.readLocal(T5, position);
            this.checkedAddress(receiver, T5, undefined, undefined, true, j);
            break;
        }
        case LITERAL_STORES: { // ordered UTF-16 stores after the complete range check
            const address = this.cell();
            const value = this.program.literals[this.cell()];
            this.readLocal(T5, address);
            for (let i = 0; i < value.length; i++) {
                this.constant(T6, value.charCodeAt(i));
                this.store(T6, 4 + 2 * i, T5, 1);
            }
            break;
        }
        default:
            if (FLOAT_OPERATIONS[op]) this.float(op);
            else this.binary(op);
        }
        return false;
    }


    lower() {
        const count = this.program.params.length;
        const incoming = calleeRegisters(this.program);
        const saved = this.savedRegisters();
        // The frame size depends on the deepest spill, known only after the body, so the
        // prologue is emitted as placeholders and patched below.
        this.emit(0);
        this.emit(0);
        for (let k = 0; k < saved.length; k++) this.emit(0);
        for (let i = 0; i < count; i++) this.writeLocal(incoming[i], i);
        // Capacity homes belong to unwritten parameters, still in their argument registers here.
        for (const [id, reg] of this.locations?.homes ?? []) {
            if (typeof id === "string") {
                if (id[0] === "c") this.constant(reg, Number(id.slice(1)));
            } else if (id < 0) this.load(reg, 0, incoming[-1 - id]);
        }
        // Pointer homes of parameters, from the incoming argument registers.
        for (const [local, list] of this.locations?.pointerWrites ?? [])
            if (local < count) for (const {reg, r, K0, other} of list) {
                if (other === undefined) this.pointerFrom(reg, incoming[local], incoming[r], K0);
                else if (other < count && local < other) this.pointerFrom(reg, incoming[local], incoming[r], K0, incoming[other]);
            }
        while (this.at < this.program.code.length && !this.step(this.cell())) {}
        const frame = (4 * (this.locals + this.spillDepth + saved.length + 1) + 15) & -16;
        if (frame > 2032) throw new SyntaxError("RV32 function frame exceeds the instruction range");
        this.words[0] = instruction.i(0x13, SP, 0, SP, -frame) >>> 0;
        this.words[1] = instruction.s(2, SP, RA, frame - 4) >>> 0;
        for (let k = 0; k < saved.length; k++)
            this.words[2 + k] = storeWord(saved[k], frame - 8 - 4 * k, SP);
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
mixin(FunctionCode, StackMethods, HomeMethods, AddressMethods, BranchMethods, ArithmeticMethods, CallMethods, FloatMethods);
