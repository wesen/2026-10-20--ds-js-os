import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import "../../../../../../picocalc-os/compiler/typed-wasm.js";

const source=readFileSync(new URL("../sources/search-limit-example.typed",import.meta.url),"utf8");
const wasm=new WebAssembly.Instance(new WebAssembly.Module(compileTyped(source))).exports;
for(const [limit,wanted,expected] of [[9,0,0],[9,3,1],[9,4,1],[9,7,2],[4,7,3],[0,0,3]]) {
    assert.equal(wasm.result(limit,wanted),expected);
}
console.log("Six bounded search outcomes verified from the guide's typed source");
