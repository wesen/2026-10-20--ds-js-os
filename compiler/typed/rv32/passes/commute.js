// The commute pass.
import {I32_ADD, I32_MUL, I32_EQ, I32_NE, CELLS, I32_GE_U, I32_SHR_S, I32_CONST, LOCAL_GET, CHECKED_ADDRESS, I32_EQZ, I32_LOAD, I32_LOAD16_U, LOCAL_SET, DROP, BR_IF, I32_STORE, I32_STORE16, CALL, BLOCK, IF, I32, ELSE, END} from "../encoding/tape.js";

// the commute pass: `c OP e` becomes `e c OP` for a literal c and commutative OP (add, mul,
// eq, ne), so the literal reaches selectConstant as a right operand. Moving a literal past
// e cannot change e's effects. Each abstract stack entry records where its cells start in
// the output; an expression whose start is not certain (a value block) is NaN and is never
// moved past.
const COMMUTATIVE = new Set([I32_ADD, I32_MUL, I32_EQ, I32_NE]);

export function commuteConstants(code, arity) {
    const out = [], stack = [], blocks = [];
    let changed = false;
    for (let at = 0; at < code.length;) {
        const op = code[at], cells = CELLS[op], a = code[at + 1];
        if (cells < 0) return null;
        const start = out.length;
        if ((op >= I32_EQ && op <= I32_GE_U) || (op >= I32_ADD && op <= I32_SHR_S)) {
            const right = stack.pop(), left = stack.pop();
            if (!left || !right) return null;
            if (COMMUTATIVE.has(op) && left.constant !== undefined && right.constant === undefined &&
                left.start + 2 === right.start && out[left.start] === I32_CONST) {
                out.push(...out.splice(left.start, 2));
                changed = true;
            }
            out.push(op);
            stack.push({start: left.start});
            at++;
            continue;
        }
        for (let k = 0; k <= cells; k++) out.push(code[at + k]);
        at += 1 + cells;
        if (op === I32_CONST) stack.push({start, constant: a});
        else if (op === LOCAL_GET || op === CHECKED_ADDRESS) stack.push({start});
        else if (op === I32_EQZ || op === I32_LOAD || op === I32_LOAD16_U) stack.push({start: stack.pop()?.start ?? NaN});
        else if (op === LOCAL_SET || op === DROP || op === BR_IF) stack.pop();
        else if (op === I32_STORE || op === I32_STORE16) { stack.pop(); stack.pop(); }
        else if (op === CALL) {
            const n = arity(a), args = stack.splice(stack.length - n, n);
            stack.push({start: n ? args[0]?.start ?? NaN : start});
        } else if (op >= BLOCK && op <= IF) {
            if (op === IF) stack.pop();
            blocks.push({value: a === I32, height: stack.length});
        } else if (op === ELSE) stack.length = blocks.at(-1).height;
        else if (op === END && blocks.length) {
            const block = blocks.pop();
            stack.length = block.height;
            if (block.value) stack.push({start: NaN});
        }
    }
    return changed ? out : null;
}

