// Included only in the experimental RV32 compiler overlays.
const FACT_FUNCTION_CAP = 2048;
const FACT_MODULE_BUDGET = 32768;
const FACT_LOCAL_CAP = 128;
const FACT_SITE_CAP = 128;
const FACT_SKIP_ZERO = 1;
const FACT_SKIP_OVERFLOW = 2;
const FACT_SCRATCH_BYTES = 7 * FACT_LOCAL_CAP + 3 * FACT_SITE_CAP;

function numericWidth(op) {
    switch (op) {
    case 0x28: case 0x2f: case 0x36: case 0x3b:
        return 3;
    case 0x02: case 0x03: case 0x04: case 0x0c: case 0x0d: case 0x10:
    case 0x20: case 0x21: case 0x41:
        return 2;
    case 0x00: case 0x05: case 0x0b: case 0x0f: case 0x1a:
    case 0x45: case 0x46: case 0x48: case 0x4a: case 0x4c: case 0x4e: case 0x4f:
    case 0x6a: case 0x6b: case 0x6c: case 0x6d: case 0x6f: case 0x74: case 0x75:
        return 1;
    default:
        return 0;
    }
}

class NumericCursor {
    constructor(code) {
        this.code = code;
        this.reset();
    }

    reset() {
        this.next = 0;
        this.at = this.previous = this.second = this.third = -1;
        this.failed = false;
    }

    advance() {
        if (this.next === this.code.length) return false;
        this.third = this.second;
        this.second = this.previous;
        this.previous = this.at;
        this.at = this.next;
        const width = numericWidth(this.code[this.at]);
        if (width === 0 || this.at + width > this.code.length) {
            this.failed = true;
            return false;
        }
        this.next += width;
        return true;
    }

    precedingConstant() {
        const code = this.code;
        if (code[this.previous] === 0x41) return code[this.previous + 1];
        if (code[this.previous] === 0x6b &&
            code[this.second] === 0x41 && code[this.third] === 0x41 &&
            code[this.third + 1] === 0)
            return -code[this.second + 1] | 0;
        return undefined;
    }
}

function analyzeDivisors(fn) {
    const values = new Int32Array(FACT_LOCAL_CAP);
    const writes = new Uint8Array(FACT_LOCAL_CAP);
    const definitions = new Uint16Array(FACT_LOCAL_CAP);
    const offsets = new Uint16Array(FACT_SITE_CAP);
    const flags = new Uint8Array(FACT_SITE_CAP);
    const cursor = new NumericCursor(fn.code);
    const firstLocal = fn.params.length;
    let depth = 0;

    while (cursor.advance()) {
        const op = fn.code[cursor.at];
        if (op === 0x02 || op === 0x03 || op === 0x04) {
            depth++;
        } else if (op === 0x0b) {
            depth--;
        } else if (op === 0x21) {
            const slot = fn.code[cursor.at + 1];
            if (slot < firstLocal || slot >= FACT_LOCAL_CAP) continue;
            const value = cursor.precedingConstant();
            if (writes[slot] === 0 && depth === 0 && value !== undefined) {
                writes[slot] = 1;
                definitions[slot] = cursor.at;
                values[slot] = value;
            } else {
                writes[slot] = 2;
            }
        }
    }
    if (cursor.failed) return null;

    let count = 0, zero = 0, overflow = 0, locals = 0;
    cursor.reset();
    while (count < FACT_SITE_CAP && cursor.advance()) {
        const op = fn.code[cursor.at];
        if (op !== 0x6d && op !== 0x6f) continue;
        let value = cursor.precedingConstant();
        const fromLocal = fn.code[cursor.previous] === 0x20;
        if (fromLocal) {
            const slot = fn.code[cursor.previous + 1];
            if (writes[slot] === 1 && definitions[slot] < cursor.previous)
                value = values[slot];
        }
        if (value === undefined || value === 0) continue;
        let skip = FACT_SKIP_ZERO;
        if (op === 0x6d && value !== -1) {
            skip |= FACT_SKIP_OVERFLOW;
            overflow++;
        }
        offsets[count] = cursor.at;
        flags[count++] = skip;
        zero++;
        if (fromLocal) locals++;
    }
    return {offsets, flags, count, zero, overflow, locals};
}
