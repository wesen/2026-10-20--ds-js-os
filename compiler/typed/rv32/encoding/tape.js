// The tape's opcodes, block types, effects and walkers (compiler/typed/tape.js, loaded first).
export const {UNREACHABLE, BLOCK, LOOP, IF, ELSE, END, BR, BR_IF, RETURN, CALL, DROP, LOCAL_GET, LOCAL_SET,
    I32_LOAD, I32_LOAD16_U, I32_STORE, I32_STORE16, I32_CONST, I32_EQZ, I32_EQ, I32_NE, I32_LT_S, I32_GT_S,
    I32_LE_S, I32_GE_S, I32_GE_U, I32_ADD, I32_SUB, I32_MUL, I32_DIV_S, I32_REM_S, I32_AND, I32_OR, I32_XOR, I32_SHL, I32_SHR_S, I32_SHR_U,
    CHECKED_ADDRESS, LITERAL_STORES, UNCHECKED_ADDRESS, I32, VOID, STORES,
    cells: CELLS, effects: EFFECTS, next: opNext, close: opClose} = typedTape;
