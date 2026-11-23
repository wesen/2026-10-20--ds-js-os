// Guarded scalar returns: a tiny unary helper's body, applied at the call site.
import {FunctionCode} from "./function-code.js";
import {T5, ZERO, T6, instruction} from "../encoding/registers.js";
import {I32_EQ, I32_NE, I32_LT_S, I32_GT_S, I32_LE_S, I32_GE_S, LOCAL_GET, I32_CONST, IF, VOID, I32_SUB, RETURN, END} from "../encoding/tape.js";

// Describe a tiny unary integer helper only after its verified operation tape is available.
// Accepted body: if (x <relation> K) return -x or C; return x.
// The branch below skips the taken action when the source predicate is false.
const GUARDED_FALSE = new Map([
    [I32_EQ,[1,false]], [I32_NE,[0,false]], // eq: bne, ne: beq
    [I32_LT_S,[5,false]], [I32_GT_S,[5,true]],  // lt: bge x,K; gt: bge K,x
    [I32_LE_S,[4,true]], [I32_GE_S,[4,false]],  // le: blt K,x; ge: blt x,K
]);

export function guardedReturnSummary(fn) {
    const t = fn.code;
    if (fn.nlocals || fn.params.length !== 1 || fn.params[0] !== "i32" || fn.result !== "i32" ||
        (t.length !== 14 && t.length !== 17)) return null;
    const branch = GUARDED_FALSE.get(t[4]);
    if (!branch || t[0] !== LOCAL_GET || t[1] !== 0 || t[2] !== I32_CONST || t[5] !== IF ||
        t[6] !== VOID || t[7] !== I32_CONST) return null;
    const negate = t.length === 17;
    if (negate && (t[8] !== 0 || t[9] !== LOCAL_GET || t[10] !== 0 || t[11] !== I32_SUB)) return null;
    const tail = t.length - 5;
    if (t[tail] !== RETURN || t[tail+1] !== END || t[tail+2] !== LOCAL_GET ||
        t[tail+3] !== 0 || t[tail+4] !== END) return null;
    return {kind: branch[0], swap: branch[1], limit: t[3], negate, literal: t[8]};
}

export class GuardedReturnCode extends FunctionCode {
    call(index) {
        const summary = this.starts[index].guardedReturn;
        if (!summary) return super.call(index);
        // pop/push preserve every lower stack operand, including any frame spills.
        const x = this.pop(T5);
        const out = this.resultRegister();
        this.move(out, x);
        const limit = summary.limit === 0 ? ZERO : T6;
        if (limit !== ZERO) this.constant(limit, summary.limit);
        const branch = this.words.length;
        this.emit(0);
        if (summary.negate) this.emit(instruction.r(0x33, out, 0, ZERO, x, 0x20));
        else this.constant(out, summary.literal);
        this.words[branch] = instruction.b(summary.kind, summary.swap ? limit : x,
            summary.swap ? x : limit, 4 * (this.words.length - branch)) >>> 0;
        this.push(out);
        if (this.inspection) this.inlinedGuard = true;
    }
}
