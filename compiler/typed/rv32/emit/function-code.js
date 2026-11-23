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
import {instruction, T5, A0, FA0, FT10, ZERO, T6, SP, RA, S0, calleeRegisters} from "../encoding/registers.js";
import {LARGE_BASE} from "./stack.js";

// Above this many bytes of locals and saved registers a function takes the large-frame form (see lower()).
const LARGE_FRAME_LOCALS = 1900;
import {loadWord, storeWord} from "../encoding/instructions.js";
import {BLOCK, RETURN, I32_CONST, UNCHECKED_ADDRESS, I32_LOAD16_U, LOCAL_GET, I32_LOAD, I32_EQZ, I32_GE_U, UNREACHABLE, LOOP, IF, ELSE, END, BR, BR_IF, CALL, DROP, LOCAL_SET, I32_STORE, I32_STORE16, CHECKED_ADDRESS, LITERAL_STORES, ARRAY_ADDRESS, ARRAY_ZERO} from "../encoding/tape.js";

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
        // ilp32f: an f32 result returns in fa0, every other in a0; a record result's leaves return as returnValue()
        // places them, and there is no single return register.
        this.returnRegister = program.results ? undefined : program.result === "f32" ? FA0 : A0;
        // A function with an f32 parameter, local or result: its frame is dropped when it uses none (dropsFrame), and
        // its result is computed in fa0 where the next operation returns it (floatResult). Integer functions keep the
        // code their pinned images record.
        this.floating = program.result === "f32" || program.params.includes("f32") || Boolean(program.localTypes) ||
            Boolean(program.results?.includes("f32"));
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
        // A return leaves every pending read behind, so an f32 function's return reads its value where it is.
        if (op >= BLOCK && op <= RETURN && !(this.floating && this.returning(this.at - 1))) this.materialize();
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
        case RETURN: this.returnValue(); this.jump(this.exit); break;
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
        case ARRAY_ADDRESS: { // a local array's element in the frame (array area offset)
            const offset = this.arrayBase + this.cell();
            const stored = this.destination();
            const out = stored ?? this.resultRegister();
            this.frameAddress(out, offset);
            this.result(out, stored);
            break;
        }
        case ARRAY_ZERO: {
            const offset = this.arrayBase + this.cell();
            this.zeroFrame(offset, this.cell());
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


    // Whether the operation at `at` returns from the function: a return, or the function's last end.
    returning(at) {
        const op = this.program.code[at];
        return op === RETURN || (op === END && this.control.length === 0);
    }

    // After lower(): this f32 function used no frame (no slot, spill, call or saved register), so it may be emitted
    // again with frameless set, without the prologue and epilogue.
    get dropsFrame() { return this.floating && !this.frameless && !this.bodyUsesFrame && this.savedRegisters().length === 0; }

    lower() {
        const count = this.program.params.length;
        const incoming = calleeRegisters(this.program);
        const saved = this.frameless ? [] : this.savedRegisters();
        // The stack-argument area of the calls this function makes, at the bottom of the frame (ilp32f: the caller's
        // sp + 4k): the slots start above it.
        const outgoing = this.frameless ? 0 : this.outgoingWords(), base = 4 * outgoing;
        // Local arrays (fn.arrayBytes, a multiple of 4): an area below the slots, above the stack-argument area and,
        // in a large frame, above ra, s0 and the saved registers.
        const arrays = this.program.arrayBytes ?? 0;
        // A large frame (more locals than sp's 12-bit offsets reach, PICOCALC-CANDELA-TYPED): ra, s0 and the saved
        // registers at the bottom (above the stack-argument area), the locals and spills above them, and s0 = sp + 2032
        // as the base of every slot at 2032 or more (load/store pick the base). Only functions with that many locals
        // take this form.
        this.large = !this.frameless && 4 * (outgoing + this.locals + saved.length + 2) + arrays > LARGE_FRAME_LOCALS;
        if (this.large) {
            this.arrayBase = base + 8 + 4 * saved.length;
            this.slotBase = this.arrayBase + arrays;
            this.emit(0);
            this.emit(0);
            this.emit(instruction.r(0x33, SP, 0, SP, T5, 0x20));
            this.emit(instruction.s(2, SP, RA, base));
            this.emit(instruction.s(2, SP, S0, base + 4));
            for (let k = 0; k < saved.length; k++) this.emit(storeWord(saved[k], base + 8 + 4 * k, SP));
            this.emit(instruction.i(0x13, S0, 0, SP, LARGE_BASE));
        } else if (!this.frameless) {
            // The frame size depends on the deepest spill, known only after the body, so the
            // prologue is emitted as placeholders and patched below.
            this.emit(0);
            this.emit(0);
            if (outgoing || arrays) this.slotBase = base + arrays;
            this.arrayBase = base;
        }
        if (!this.large) for (let k = 0; k < saved.length; k++) this.emit(0);
        for (let i = 0; i < count; i++) if (incoming[i] >= 0) this.writeLocal(incoming[i], i);
        // Parameters on the stack (ilp32f, beyond the argument registers): from the caller's sp, t5 here, into their
        // homes or slots.
        if (incoming.stack) {
            this.callerStack(T5);
            for (let i = 0; i < count; i++) if (incoming[i] < 0) {
                const home = this.locations?.homes.get(i), offset = 4 * (-1 - incoming[i]);
                if (home !== undefined) this.load(home, offset, T5);
                else {
                    this.load(T6, offset, T5);
                    this.store(T6, (this.slotBase ?? 0) + 4 * i);
                }
            }
        }
        // Capacity homes belong to unwritten parameters, still in their argument registers here.
        for (const [id, reg] of this.locations?.homes ?? []) {
            if (typeof id === "string") {
                if (id[0] === "c") this.constant(reg, Number(id.slice(1)));
                else if (id[0] === "f") this.floatConstant(reg, Number(id.slice(1)));
            } else if (id < 0) this.load(reg, 0, incoming[-1 - id]);
        }
        // Pointer homes of parameters, from the incoming argument registers.
        for (const [local, list] of this.locations?.pointerWrites ?? [])
            if (local < count) for (const {reg, r, K0, other} of list) {
                if (other === undefined) this.pointerFrom(reg, incoming[local], incoming[r], K0);
                else if (other < count && local < other) this.pointerFrom(reg, incoming[local], incoming[r], K0, incoming[other]);
            }
        while (this.at < this.program.code.length && !this.step(this.cell())) {}
        this.bodyUsesFrame = Boolean(this.usesFrame); // before the epilogue reloads ra
        if (this.frameless) {
            this.mark(this.exit);
            this.emit(instruction.i(0x67, ZERO, 0, RA, 0));
            this.patchBranches();
            return this;
        }
        if (this.large) {
            const frame = (this.slotBase + 4 * (this.locals + this.spillDepth) + 15) & -16;
            if (frame > LARGE_BASE + 2047) throw new SyntaxError("RV32 function frame exceeds the instruction range");
            const lo = (frame << 20) >> 20;
            this.words[0] = (((frame - lo) & 0xfffff000) | (T5 << 7) | 0x37) >>> 0;
            this.words[1] = instruction.i(0x13, T5, 0, T5, lo) >>> 0;
            this.patchCallerStacks(S0, frame - LARGE_BASE);
            this.mark(this.exit);
            for (let k = 0; k < saved.length; k++) this.emit(loadWord(saved[k], base + 8 + 4 * k, SP));
            this.emit(instruction.i(0x03, RA, 2, SP, base));
            this.emit(instruction.i(0x03, S0, 2, SP, base + 4));
            this.emit(((frame - lo) & 0xfffff000) | (T5 << 7) | 0x37);
            this.emit(instruction.i(0x13, T5, 0, T5, lo));
            this.emit(instruction.r(0x33, SP, 0, SP, T5));
            this.emit(instruction.i(0x67, ZERO, 0, RA, 0));
            this.patchBranches();
            return this;
        }
        const frame = (4 * (outgoing + this.locals + this.spillDepth + saved.length + 1) + arrays + 15) & -16;
        if (frame > 2032) throw new SyntaxError("RV32 function frame exceeds the instruction range");
        this.patchCallerStacks(SP, frame);
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

    // The caller's sp is the frame's top: sp + frame, or s0 + frame - 2032 in a large frame (callerStack).
    patchCallerStacks(from, offset) {
        for (const {at, reg} of this.callerStacks ?? []) this.words[at] = instruction.i(0x13, reg, 0, from, offset) >>> 0;
    }
}
mixin(FunctionCode, StackMethods, HomeMethods, AddressMethods, BranchMethods, ArithmeticMethods, CallMethods, FloatMethods);
