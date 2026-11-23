// The tape's opcodes, block types, effects and walkers (compiler/typed/tape.js, loaded first).
export const {UNREACHABLE, BLOCK, LOOP, IF, ELSE, END, BR, BR_IF, RETURN, CALL, DROP, LOCAL_GET, LOCAL_SET,
    I32_LOAD, I32_LOAD16_U, I32_STORE, I32_STORE16, I32_CONST, I32_EQZ, I32_EQ, I32_NE, I32_LT_S, I32_GT_S,
    I32_LE_S, I32_GE_S, I32_GE_U, I32_ADD, I32_SUB, I32_MUL, I32_DIV_S, I32_REM_S, I32_AND, I32_OR, I32_XOR, I32_SHL, I32_SHR_S, I32_SHR_U,
    CHECKED_ADDRESS, LITERAL_STORES, UNCHECKED_ADDRESS, I32, F32, VOID, STORES,
    F32_LOAD, F32_STORE, F32_CONST, F32_EQ, F32_NE, F32_LT, F32_GT, F32_LE, F32_GE, F32_ABS, F32_NEG, F32_CEIL,
    F32_FLOOR, F32_TRUNC, F32_SQRT, F32_ADD, F32_SUB, F32_MUL, F32_DIV, F32_COPYSIGN, F32_CONVERT_I32_S,
    I32_REINTERPRET_F32, F32_REINTERPRET_I32, I32_TRUNC_F32, F32_MIN, F32_MAX,
    I32_LT_U, I32_GT_U, I32_LE_U, I32_DIV_U, I32_REM_U, F32_CONVERT_I32_U, U32_TRUNC_F32, ARRAY_ADDRESS, ARRAY_ZERO,
    cells: CELLS, effects: EFFECTS, next: opNext, close: opClose, row: tapeRow} = typedTape;
// The f32 operations (a row that pops or pushes an f32): passes with an abstract operand stack take their pops and
// pushes from the row (tapeRow(op).pop.length, .push.length).
export const FLOATING = new Uint8Array(256);
for (const row of typedTape.rows) if (row.pop && [...row.pop, ...row.push].includes(F32)) FLOATING[row.code] = 1;
