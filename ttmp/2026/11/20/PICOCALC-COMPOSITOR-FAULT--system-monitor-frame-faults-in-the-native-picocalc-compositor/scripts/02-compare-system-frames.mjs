// Replay both versions of the producer into the actual compositor; compare every drawing call.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const path = "picocalc-os/js/apps/sysmon.js";
const old = fs.readFileSync(0, "utf8"); // git show dcf3fca:picocalc-os/js/apps/sysmon.js
const current = fs.readFileSync(path, "utf8");
const compositor = fs.readFileSync("picocalc-os/js/system/compositor.js", "utf8");
const builder = new Proxy({}, { get: () => () => builder });
const ui = {
  text: (s, o) => ({t:"text", s, ...o}), row: (o,...kids) => ({t:"row",kids,...o}),
  col: (o,...kids) => ({t:"col",kids,...o}), gap: h => ({t:"gap",h}),
  sep: o => ({t:"sep",...o}), kv: (pairs,o) => ({t:"kv",pairs,...o}),
  table: (cols,rows,o) => ({t:"table",cols,rows,...o}), spark: (values,o) => ({t:"spark",values,...o}),
};
function treeMaker(source) {
  let screen;
  const app = new Proxy({}, { get: (_, key) => (...args) => {
    if (key === "screen") screen = args[0];
    return app;
  }});
  vm.runInNewContext(source, {app: () => app, ui});
  return screen;
}
const make = [treeMaker(old), treeMaker(current)];
const calls = [];
const fb = new Proxy({}, {get: (_, op) => (...args) => calls.push([op,...args])});
const render = vm.runInNewContext(compositor + '\nF = {s:[6,12],m:[8,16],mb:[8,16]}; (tree) => draw(fb,tree,8,28,304,270)', {service: () => builder,fb});
const handles = Array.from({length:36}, (_,i) => ({id:i, holders:["display"], type:"dma", claim:"dma", rights:"r", kb:24}));
const worlds = Array.from({length:28}, (_,i) => ({name:"world" + i,state:"idle",cpu_ms:4.1,turns:38,mem_kb:322,claims:["dma"],pct:0.012,mbox:0,mbox_peak:4,budget_ms:80,limit_kb:768}));
const hist = Array.from({length:48}, (_,i) => i / 47);
const buses = ["spi2","i2c"].map(name => ({name, transfers:2,bytes:5,busy_ms:1.4,errors:0}));
const state = {worlds,handles,focused:true, lane:hist,i2c:hist,spi:hist,last:{t_ms:500,buses}};
const summary = [];
for (const [tab,count] of [[0,worlds.length],[1,handles.length],[2,1]]) {
  let lengths;
  for (let sel=0;sel<count;sel++) {
    const trees=make.map(fn=>fn({...state,tab,sel}));
    lengths=trees.map(x=>Buffer.byteLength(JSON.stringify(x)));
    const operations=trees.map(tree=>{
      calls.length=0;
      render(tree);
      return JSON.stringify(calls);
    });
    assert.equal(operations[0],operations[1], 'different draw operations at tab ' + tab + ' row ' + sel);
  }
  summary.push({tab,selections:count,oldBytes:lengths[0],newBytes:lengths[1]});
}
console.log(JSON.stringify(summary,null,2));
