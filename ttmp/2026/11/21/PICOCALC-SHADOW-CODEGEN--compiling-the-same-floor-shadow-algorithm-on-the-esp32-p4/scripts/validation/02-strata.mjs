// Cross-check the measured Wasm coordinate masks against the independent integer classifier.
import {readFileSync as read} from "node:fs";
import {join} from "node:path";
import assert from "node:assert/strict";
import {classify} from "../device/02-classifier.mjs";
const dir=process.argv[2], blob=read(join(dir,"masks.bin")), paths=JSON.parse(read(join(dir,"paths.json")));
const header=read(join(dir,"inputs.h"),"utf8");
const cells=[...header.matchAll(/"[^"]+",[\d,u]+,\{([\d,]+)\}\}/g)].map(m=>m[1].split(",").map(Number));
assert.equal(cells.length,paths.length);
const symbol={x:"X",y:"Y",miss:"M",hit:"H"};
let calls=0,visits=0,magnitudes=0,single=0,defaultMagnitudes=0;
for(let i=0;i<paths.length;i++){
    const counts={};
    for(let k=0;k<25600;k++){
        const expected=blob[25600*i+k];
        if(!expected) continue;
        const {result,path}=classify(cells[i],k%160,k/160|0);
        assert.equal(result+1,expected);
        const word=path.map(v=>symbol[v]).join("");
        counts[word]=(counts[word]??0)+1;
        const abs=word.length+word.replaceAll("X","").length;
        magnitudes+=abs;
        if(!i) defaultMagnitudes+=abs;
        visits+=word.length;calls++;
    }
    assert.deepEqual(counts,paths[i].patterns);
}
const first=cells[0].slice();first[16]=1;
for(let k=0;k<25600;k++) {
    const {path}=classify(first,k%160,k/160|0);
    assert.equal("XYMH".indexOf(symbol[path[0]]),blob[12*25600+k]);single++;
}
assert.equal(defaultMagnitudes,74226);
console.log(JSON.stringify({floorCalls:calls,sphereVisits:visits,magnitudeCalls:magnitudes,defaultMagnitudes,singleSphereCalls:single,fixtures:cells.length}));
