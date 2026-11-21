// Independent witness for the workbook, using only Node and committed artifacts.
// Run from any directory. This deliberately does not execute the proposed API.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";

const root = new URL("../../PICOCALC-ROW-IR--trace-the-ray-row-through-gcc-and-llvm-optimization-passes/various/", import.meta.url);
const bytes = path => readFileSync(new URL(path, root));
const json = path => JSON.parse(bytes(path));
const gunzip = path => gunzipSync(bytes("llvm-pipeline/" + path + ".gz"));
const manifest = json("llvm-pipeline/manifest.json");
const streams = new Map();
for (const [variant, phases] of Object.entries(manifest)) {
    for (const [phase, record] of Object.entries(phases)) {
        const name = variant + "-" + phase;
        const raw = gunzip(name + ".log");
        const index = JSON.parse(gunzip(name + ".index.json"));
        assert.equal(createHash("sha256").update(raw).digest("hex"), record.sha256);
        assert.equal(index.length, record.dumps);
        const states = index.map(({offset, header}, i) => {
            const end = index[i+1]?.offset ?? raw.length;
            assert(offset >= 0 && end > offset && end <= raw.length);
            const text = raw.toString("utf8", offset, end);
            assert(text.slice(0, text.indexOf("\n")).includes(header));
            return {header, text};
        });
        streams.set(name, states);
    }
}
function body(ordinal) {
    const entry = streams.get("checked-middle")[ordinal];
    const match = /^define [^\n]*@row\(.*?^}/ms.exec(entry.text);
    assert(match, entry.header);
    return match[0];
}
const count = (s, re) => [...s.matchAll(re)].length;
const facts = {};
facts.headers = [...streams.values()].reduce((n,x) => n+x.length, 0);
assert.equal(facts.headers, 4133);
facts.headerLoadSites = [70,73,74].map(i => count(body(i), /load i32, ptr %work,/g));
assert.deepEqual(facts.headerLoadSites, [11,11,6]);
facts.allocasAndPhis = [5,6].map(i => [count(body(i), / = alloca /g), count(body(i), / = phi /g)]);
assert.deepEqual(facts.allocasAndPhis, [[16,0],[0,3]]);
facts.rewriters = [74,78].map(i => {
    const {header,text} = streams.get("checked-backend")[i];
    assert.match(header,/Virtual Register Rewriter/);
    return /NoVRegs/.test(text.split("\n")[1]);
});
assert.deepEqual(facts.rewriters,[false,true]);
for(const name of ["checked","unchecked","firmware"])
    assert(!/!DI(?:Location|CompileUnit)\(/.test(gunzip(name+"-raw.ll").toString()));
const c = json("passes/execution.json"), typed = json("passes/typed-counts.json");
facts.checked = Object.fromEntries(["checked-gcc","checked-llvm","checked-llc","checked-llc-nolsr"].map(k=>[k,c[k].totals.instructions]));
assert.deepEqual(Object.values(facts.checked),[1136142,1233611,1233611,1275560]);
facts.savedWithLSR = c["checked-llc-nolsr"].totals.instructions-c["checked-llc"].totals.instructions;
assert.equal(facts.savedWithLSR,41949);
facts.typedStack = typed.stock.totals.stackLoads+typed.stock.totals.stackStores;
assert.equal(facts.typedStack,1290106);
assert.equal(typed.pie.totals.packets,3135);
assert.equal(Object.values(c).concat(Object.values(typed)).reduce((n,r)=>n+r.rowsVerified,0),2080);
console.log(JSON.stringify(facts,null,2));
