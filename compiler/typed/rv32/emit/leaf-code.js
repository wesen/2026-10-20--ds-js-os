// LeafCode: frameless leaves.
import {FunctionCode} from "./function-code.js";
import {FLOAT_OPERATIONS} from "./floats.js";
import {instruction, ZERO, RA, calleeRegisters, calleeResults} from "../encoding/registers.js";
import {ALU} from "../encoding/selection.js";
import {BLOCK, IF, ELSE, END, BR, BR_IF, RETURN, DROP, LOCAL_GET, I32_CONST, I32_EQZ, I32_EQ, I32_NE, I32_LT_S, I32_GT_S, I32_LE_S, I32_GE_S, I32_GE_U, CELLS, F32_LOAD, F32_STORE,
    I32_LT_U, I32_GT_U, I32_LE_U} from "../encoding/tape.js";

// An allowlist keeps any new operation with a possible frame dependency on the
// ordinary path until its frameless lowering is reviewed.
// The f32 operations other than memory accesses need no frame either (they use t5, t6, ft10 and ft11 at most).
const LEAF_OPERATIONS = new Set([
    BLOCK, IF, ELSE, END, BR, BR_IF, RETURN, DROP, LOCAL_GET, I32_CONST, I32_EQZ,
    I32_EQ, I32_NE, I32_LT_S, I32_GT_S, I32_LE_S, I32_GE_S, I32_GE_U, I32_LT_U, I32_GT_U, I32_LE_U, ...ALU.keys(),
    ...[...FLOAT_OPERATIONS.keys()].filter(op => FLOAT_OPERATIONS[op] && op !== F32_LOAD && op !== F32_STORE),
]);
const LEAF_SPILL = Symbol("frameless function needs an operand spill");

class LeafCode extends FunctionCode {
    spill() { throw LEAF_SPILL; }

    step(op) {
        if (op !== LOCAL_GET) return super.step(op);
        const local = this.cell();
        if (local >= this.program.params.length) throw LEAF_SPILL;
        // select.leafParams: a frameless leaf never writes a parameter, so reads use it in place (a0-a7, fa0-fa7).
        const incoming = calleeRegisters(this.program)[local];
        if (this.select?.leafParams) this.pushHome(incoming);
        else this.push(incoming);
        return false;
    }

    lower() {
        this.frameless = true;
        while (this.at < this.program.code.length && !this.step(this.cell())) {}
        if (this.at !== this.program.code.length || this.control.length) throw LEAF_SPILL;
        this.mark(this.exit);
        this.emit(instruction.i(0x67, ZERO, 0, RA, 0));
        this.patchBranches();
        return this;
    }
}

function declineLeaf(fn, reason) {
    if (fn.nativeInspection) fn.nativeInspection.leafDecision = reason;
    return null;
}

export function lowerLeaf(fn, callables, targets, select, facts) {
    if (fn.nlocals) return declineLeaf(fn, "function declares frame locals");
    if (fn.code.length > 128) return declineLeaf(fn, "operation tape exceeds 128 cells");
    if (fn.params.length > 8 || !fn.params.every(type => type === "i32" || type === "bool" || type === "f32" || type === "u32"))
        return declineLeaf(fn, "argument list outside leaf convention");
    // A record result's stack words are written through the caller's sp, which a frameless leaf does not compute.
    if (calleeResults(fn)?.stack) return declineLeaf(fn, "record result on the stack");
    for (let at = 0; at < fn.code.length;) {
        const op = fn.code[at++];
        if (!LEAF_OPERATIONS.has(op) || at + CELLS[op] > fn.code.length)
            return declineLeaf(fn, "operation outside frameless allowlist");
        at += CELLS[op];
    }
    try {
        const leaf = new LeafCode(fn, callables, targets);
        leaf.select = select;
        leaf.facts = facts;
        return leaf.lower();
    } catch (error) {
        if (error !== LEAF_SPILL) throw error;
        return declineLeaf(fn, "leaf requires frame storage");
    }
}

