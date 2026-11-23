// LeafCode: frameless leaves.
import {FunctionCode} from "./function-code.js";
import {A0, instruction, ZERO, RA} from "../encoding/registers.js";
import {ALU} from "../encoding/selection.js";
import {BLOCK, IF, ELSE, END, BR, BR_IF, RETURN, DROP, LOCAL_GET, I32_CONST, I32_EQZ, I32_EQ, I32_NE, I32_LT_S, I32_GT_S, I32_LE_S, I32_GE_S, I32_GE_U, CELLS} from "../encoding/tape.js";

// An allowlist keeps any new operation with a possible frame dependency on the
// ordinary path until its frameless lowering is reviewed.
const LEAF_OPERATIONS = new Set([
    BLOCK, IF, ELSE, END, BR, BR_IF, RETURN, DROP, LOCAL_GET, I32_CONST, I32_EQZ,
    I32_EQ, I32_NE, I32_LT_S, I32_GT_S, I32_LE_S, I32_GE_S, I32_GE_U, ...ALU.keys(),
]);
const LEAF_SPILL = Symbol("frameless function needs an operand spill");

class LeafCode extends FunctionCode {
    spill() { throw LEAF_SPILL; }

    step(op) {
        if (op !== LOCAL_GET) return super.step(op);
        const local = this.cell();
        if (local >= this.program.params.length) throw LEAF_SPILL;
        // select.leafParams: a frameless leaf never writes a parameter, so reads use it in place.
        if (this.select?.leafParams) this.pushHome(A0 + local);
        else this.push(A0 + local);
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
    if (fn.params.length > 8 || !fn.params.every(type => type === "i32" || type === "bool"))
        return declineLeaf(fn, "argument list outside leaf convention");
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

