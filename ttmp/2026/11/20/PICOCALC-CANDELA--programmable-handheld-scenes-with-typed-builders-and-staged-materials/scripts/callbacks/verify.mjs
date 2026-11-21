import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const ctx = vm.createContext({});
for (const name of ["typed-wasm", "typed-rv32"]) {
    vm.runInContext(fs.readFileSync("picocalc-os/compiler/" + name + ".js","utf8"),ctx);
}
const types = fs.readFileSync("picocalc-os/worlds/candela/pattern-types.typed","utf8");
const good = types + `
function append(g: buffer, point: SurfacePoint, value: ScalarExpr): ScalarExpr {
    g.setCharCodeAt(0,g.charCodeAt(0)+1);
    return value;
}
function derived(g: buffer, p: ScalarExpr): ScalarExpr {
    const result = pattern(p => append(g,p,ScalarExpr(40)));
    return ScalarExpr(i32(result)+i32(p));
}
function held(g: buffer, handle: ScalarExpr): ScalarExpr {
    return pattern(p => append(g,p,handle));
}`;
const wasm = ctx.typedWasm.compile(good).bytes;
const rv32 = ctx.typedRv32.compile(good).image;
const api = new WebAssembly.Instance(new WebAssembly.Module(wasm)).exports;
const mem = new DataView(api.memory.buffer);
mem.setUint32(64,4,true);
assert.equal(api.derived(64,2),42);
assert.equal(api.held(64,17),17);
assert.equal(mem.getUint16(68,true),2);
const invalid = [
    ['function bad(b: BoolExpr): i32 { if (b) { return 1; } return 0; }',/per-hit BoolExpr/],
    ['function bad(h: ScalarExpr): ScalarExpr { return pattern(p => h = 3); }',/read-only/],
    ['function bad(): i32 { return pattern(p => 7); }',/staged expression handle/],
    ['function bad(): ScalarExpr { return pattern(p => { return ScalarExpr(1); }); }',/one expression/],
    ['function bad(): ScalarExpr { return pattern(p => unknown); }',/unknown local/],
];
for (const [body, diagnostic] of invalid) {
    for (const target of [ctx.typedWasm,ctx.typedRv32]) assert.throws(() => target.compile(types+body),diagnostic);
}
console.log(JSON.stringify({wasmBytes:wasm.length,rv32Bytes:rv32.length,callbackInvocations:2,negativeChecks:invalid.length*2}));
