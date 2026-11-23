// The rejected compiles of 08-qjs-diagnostics.c: Typed sources the tests reject (typed-f32, typed-bitwise,
// typed-rv32's option errors, typed-async's diagnostics), compiled by typedRv32.compile as the P4's linkers call
// it; each result is what typed_p4.c prints after "compile rejected: " (String(exception)), and whether the stack
// names a line of the compiler's source.
(() => {
    const body = expr => "function f(a: f32, b: f32, n: i32): f32 { return " + expr + "; }";
    const bits = statement => "enum Flags { A = 1, B = 2 }\nfunction f(a: i32, g: Flags): i32 { " + statement + " }";
    const cases = [
        [body("a + 1")], [body("a + n")], [body("a % b")], [body("a & b")], [body("1e39")], [body("f32(a < b)")],
        [body("Math.sqrt(n)")], [body("Math.min(a, n)")], [body("Math.sin(a)")],
        ["function f(a: f32): i32 { return a; }"], ["function f(a: f32): bool { return a; }"],
        [bits("return 0x;")], [bits("return 0x123456789;")], [bits("return 0xfg;")], [bits("return 2147483648;")],
        [bits("if (a & 1 === 1) { return 1; } return 0;")], [bits("return i32(g << 1);")], [bits("return a & true;")],
        ["function f(): i32 { return undefinedName; }"], ["function f(): i32 { return g(); }"],
        ["function f(a: i32): i32 { return f(a, a); }"], ["function f(: i32 { return 0; }"], ["function"],
        ["record R { x: i32 }\nfunction f(r: R): i32 { return r.y; }"],
        ["function f(): i32 { await typedSdkYield(); return 0; }"],
        ["async function work(handle: i32): i32 { return handle; }"],
        ["function f(): i32 { return 1; }", {policy: "fast"}],
        ["function f(): i32 { return 1; }", {passes: ["fold"]}],
        ["function f(): i32 { return 1; }", {passes: ["rotate", "commute"]}],
        ["function f(): i32 { return 1; }", {passes: ["version"]}],
        ["function f(): i32 { return 1; }", {policy: "kernel", disable: ["ranges"]}],
        ["function f(): i32 { return 1; }", {select: {rotate: true}}],
        [12345],
    ];
    return JSON.stringify(cases.map(([source, options]) => {
        try {
            typedRv32.compile(source, [], 65536, options);
            return {ok: true};
        } catch (error) {
            const stack = String(error && error.stack || "");
            return {message: String(error), stackLines: /(typed-[\w-]+|tape)\.js:\d+/.test(stack), firstFrame: stack.split("\n")[0]};
        }
    }), null, 1);
})()
