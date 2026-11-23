// Which functions store nothing (the hoist option of the version pass asks it about callees).
import {CALL, CELLS, EFFECTS, STORES, opNext} from "../encoding/tape.js";

// A function stores nothing when its tape has no operation with the STORES effect and calls only such
// functions. Imports and functions not yet declared are assumed to store. callables grows as the front end
// declares functions; a lowered function's tape is released, so the hoist option records the answer for each
// function before any pass rewrites it.
export function storelessAnalysis(callables, importCount) {
    const memo = new Map();
    return function storeless(index) {
        if (memo.has(index)) return memo.get(index);
        memo.set(index, false);
        const tape = index >= importCount ? callables[index]?.code : undefined;
        let result = Boolean(tape);
        for (let at = 0; result && at < tape.length; at = opNext(tape, at)) {
            const op = tape[at];
            if (!(CELLS[op] >= 0) || EFFECTS[op] & STORES) result = false;
            else if (op === CALL) result = storeless(tape[at + 1]);
        }
        memo.set(index, result);
        return result;
    };
}
