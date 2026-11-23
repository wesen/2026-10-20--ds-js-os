// Local arrays (PICOCALC-TYPED-VALUES): `const a = new Float32Array(16)`, JavaScript's typed arrays of a fixed length
// that live in the function. Their methods are ExpressionParser's (copied onto its prototype below, as values.js does).
//
// A function's arrays are one area of fn.arrayBytes bytes, each array at a byte offset in it; array.address pushes
// the address of an offset (RV32: in the frame; WebAssembly: a static area at the top of the module's memory, which
// is enough because a function is never active twice, the call graph being acyclic). The declaration zeroes the
// array (array.zero), as JavaScript's `new` and WGSL's `var` do, each time it runs. `a[i]` checks i against the
// length, unsigned, so a negative index traps too (`local.get i; i32.const n; i32.ge_u; if; unreachable; end`), then
// reads or writes the word at address + 4i. Two indices cost no check at run time: a literal, checked here, and the
// counter of a counted loop that proves it in range (countedRange, proveChecks). `a.length` is a literal. An array is
// not a value: it is not assigned, passed, returned or compared.
const ARRAY_ELEMENTS = new Map([["Int32Array", "i32"], ["Uint32Array", "u32"], ["Float32Array", "f32"]]);
const ARRAY_LIMIT = 1024;

class ArrayParsing {
    // `new T(n)` of `let|const id = new T(n)`, at "new": n an integer literal from 1 to ARRAY_LIMIT.
    arrayDeclaration(id, annotation) {
        const lex = this.lex;
        if (annotation !== null) lex.fail("an array takes the type of its new expression, without an annotation");
        lex.next();
        const type = lex.token.value, element = ARRAY_ELEMENTS.get(type);
        if (!element) lex.fail("expected Int32Array, Uint32Array or Float32Array after new");
        lex.next();
        lex.expect("(");
        const length = lex.token.kind === "int" ? Number(lex.token.value) : NaN;
        if (!(length >= 1 && length <= ARRAY_LIMIT)) lex.fail("an array's length is an integer literal from 1 to " + ARRAY_LIMIT);
        lex.next();
        lex.expect(")");
        if (this.locals.has(id)) lex.fail("duplicate local " + id);
        const offset = this.arrayBytes ?? 0;
        this.arrayBytes = offset + 4 * length;
        this.locals.set(id, {type, array: {offset, length, element}});
        this.code.push(ARRAY_ZERO, offset, 4 * length);
    }

    // `[i]` after an array's name: the element's address on the operand stack, checked.
    arrayElement(array) {
        const lex = this.lex, code = this.code;
        lex.expect("[");
        const start = code.length;
        const type = this.expr();
        lex.expect("]");
        if (type !== LITERAL && type !== U32_LITERAL && type !== "i32" && type !== "u32")
            lex.fail("an array index is an i32 or a u32, got " + scalarType(type));
        const {offset, length} = array;
        if (code.length === start + 2 && code[start] === I32_CONST) {
            const index = code[start + 1] >>> 0;
            if (index >= length) lex.fail("array index " + index + " out of range for length " + length);
            this.truncate(start);
            code.push(ARRAY_ADDRESS, offset + 4 * index);
            return;
        }
        // A local is read again for the address; any other index is computed once into a fresh local.
        let local;
        if (code.length === start + 2 && code[start] === LOCAL_GET) {
            local = code[start + 1];
            this.truncate(start);
            // The counter of an enclosing counted loop below the length: the check may go when the loop ends.
            for (let k = (this.countedLoops?.length ?? 0) - 1; k >= 0; k--) {
                const proof = this.countedLoops[k];
                if (proof.local !== local || proof.code !== code) continue;
                if (proof.bound <= length) (this.boundChecks ??= []).push({at: code.length, proof});
                break;
            }
        } else this.emitIndex(LOCAL_SET, local = this.nextLocal++);
        this.emitIndex(LOCAL_GET, local);
        this.emitConst(length);
        code.push(I32_GE_U, IF, VOID, UNREACHABLE, END, ARRAY_ADDRESS, offset);
        this.emitIndex(LOCAL_GET, local);
        this.emitConst(2);
        code.push(I32_SHL, I32_ADD);
    }

    // A counted loop's range proof, after its header: `for (k = c; k < n; k = k + s)` (the tape `const c; set k`,
    // `get k; const n; lt; eqz; br_if 1` and the update `get k; const s; add; set k`) holds k below n whenever its
    // body starts, when the body never writes k: unsigned for lt_u, and for lt_s when c and s are not negative, so k
    // never is. initAt is where the header's initialization starts, conditionAt its condition.
    countedRange(initAt, conditionAt, update) {
        const code = this.code;
        if (conditionAt - initAt !== 8 || code.length !== conditionAt + 8 || code[initAt] !== I32_CONST ||
            code[initAt + 2] !== LOCAL_SET) return null;
        const local = code[initAt + 3], first = code[initAt + 1];
        if (code[conditionAt] !== LOCAL_GET || code[conditionAt + 1] !== local || code[conditionAt + 2] !== I32_CONST)
            return null;
        if (update.length !== 7 || update[0] !== LOCAL_GET || update[1] !== local || update[2] !== I32_CONST ||
            update[4] !== I32_ADD || update[5] !== LOCAL_SET || update[6] !== local) return null;
        const bound = code[conditionAt + 3], compare = code[conditionAt + 4], step = update[3];
        if (compare === I32_LT_U) return {local, bound: bound >>> 0, code};
        if (compare === I32_LT_S && first >= 0 && step >= 0 && bound >= 0 && bound <= 1 << 30 && step <= 1 << 30)
            return {local, bound, code};
        return null;
    }

    // A counted loop's body has ended at the tape's end, from bodyAt: unless it writes the counter, the checks of
    // the counter it recorded are removed (nine cells each; the positions of later checks move down).
    proveChecks(proof, bodyAt) {
        const code = this.code, checks = this.boundChecks ?? [];
        this.boundChecks = checks.filter(check => check.proof !== proof);
        for (let at = bodyAt; at < code.length; at += 1 + CELLS[code[at]])
            if (code[at] === LOCAL_SET && code[at + 1] === proof.local) return;
        const mine = checks.filter(check => check.proof === proof).sort((x, y) => y.at - x.at);
        for (const {at} of mine) {
            if (code[at] !== LOCAL_GET || code[at + 1] !== proof.local || code[at + 4] !== I32_GE_U || code[at + 5] !== IF ||
                code[at + 7] !== UNREACHABLE || code[at + 8] !== END) throw new Error("array check moved at " + at);
            code.copyWithin(at, at + 9);
            code.length -= 9;
            code.spans?.splice(at, 9);
            for (const check of this.boundChecks) if (check.at > at) check.at -= 9;
        }
    }

    // Drop the tape from start (an inspection tape's spans too).
    truncate(start) {
        this.code.length = start;
        if (this.code.spans) this.code.spans.length = start;
    }

    // An array's name in an expression: `a[i]` or `a.length`.
    arrayRead(array) {
        const lex = this.lex;
        if (lex.accept(".")) {
            if (lex.ident() !== "length") lex.fail("an array has only .length");
            this.emitConst(array.length);
            return LITERAL;
        }
        if (lex.token.value !== "[") lex.fail("an array is not a value; index it or read its length");
        this.arrayElement(array);
        this.emitMemory(array.element === "f32" ? F32_LOAD : I32_LOAD, 2, 0);
        return array.element;
    }

    // `a[i] = e;` as a statement.
    arrayAssignment(array, statement) {
        const lex = this.lex;
        if (!statement || lex.token.value !== "[") lex.fail("an array is not assignable; assign its elements");
        this.arrayElement(array);
        lex.expect("=");
        this.want(this.expr(), array.element);
        this.emitMemory(array.element === "f32" ? F32_STORE : I32_STORE, 2, 0);
    }
}
for (const name of Object.getOwnPropertyNames(ArrayParsing.prototype))
    if (name !== "constructor") Object.defineProperty(ExpressionParser.prototype, name,
        Object.getOwnPropertyDescriptor(ArrayParsing.prototype, name));
