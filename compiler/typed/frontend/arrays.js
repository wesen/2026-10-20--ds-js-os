// Local arrays (PICOCALC-TYPED-VALUES): `const a = new Float32Array(16)`, JavaScript's typed arrays of a fixed length
// that live in the function. Their methods are ExpressionParser's (copied onto its prototype below, as values.js does).
//
// A function's arrays are one area of fn.arrayBytes bytes, each array at a byte offset in it; array.address pushes
// the address of an offset (RV32: in the frame; WebAssembly: a static area at the top of the module's memory, which
// is enough because a function is never active twice, the call graph being acyclic). The declaration zeroes the
// array (array.zero), as JavaScript's `new` and WGSL's `var` do, each time it runs. `a[i]` checks i against the
// length, unsigned, so a negative index traps too (`local.get i; i32.const n; i32.ge_u; if; unreachable; end`), then
// reads or writes the word at address + 4i; a literal index is checked here and costs no check at run time.
// `a.length` is a literal. An array is not a value: it is not assigned, passed, returned or compared.
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
        } else this.emitIndex(LOCAL_SET, local = this.nextLocal++);
        this.emitIndex(LOCAL_GET, local);
        this.emitConst(length);
        code.push(I32_GE_U, IF, VOID, UNREACHABLE, END, ARRAY_ADDRESS, offset);
        this.emitIndex(LOCAL_GET, local);
        this.emitConst(2);
        code.push(I32_SHL, I32_ADD);
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
