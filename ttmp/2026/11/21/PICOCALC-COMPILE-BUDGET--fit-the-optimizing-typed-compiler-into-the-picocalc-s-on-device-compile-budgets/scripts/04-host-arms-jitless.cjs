// node --jitless 04-host-arms-jitless.cjs REPO ARMS.json ROUNDS GENERATED_DIR [RV32_FILE]
// Host proxy for the arms firmware: median compile time per world and arm in an interpreter
// (V8 Ignition), with each world's device imports (Files and Agenda: none; Editor and Chess:
// typedWorld.imports, with typed-world.js's larger source limit) and sources (Editor and Chess as the firmware build assembles them, read
// from GENERATED_DIR = BUILD/esp-idf/main). Times the backend entry typedRv32.compile only.
const {readFileSync} = require("fs"), vm = require("vm");
const [repo, armsFile, rounds, gen, rv32] = process.argv.slice(2), root = repo + "/picocalc-os/";
for (const f of ["compiler/typed-wasm.js", "compiler/typed-async.js"]) vm.runInThisContext(readFileSync(root + f, "utf8"), {filename: f});
vm.runInThisContext(readFileSync(rv32 ?? root + "compiler/typed-rv32.js", "utf8"), {filename: "typed-rv32.js"});
vm.runInThisContext(readFileSync(root + "compiler/typed-world.js", "utf8"), {filename: "typed-world.js"});
const read = p => readFileSync(root + p, "utf8");
const worlds = {files: [read("worlds/files/files.typed"), undefined],
  agenda: [read("worlds/agenda/reminder.typed") + "\n" + read("worlds/agenda/entry.typed"), undefined],
  editor: [readFileSync(gen + "/editor.typed", "utf8"), typedWorld.imports], chess: [readFileSync(gen + "/chess.typed", "utf8"), typedWorld.imports]};
const arms = JSON.parse(readFileSync(armsFile, "utf8")), out = {};
for (const [w, [src, imports]] of Object.entries(worlds)) for (const [a, o] of Object.entries(arms)) {
  const t = [];
  for (let i = 0; i <= +rounds; i++) { const s = process.hrtime.bigint(); typedRv32.compile(src, imports, imports ? 1 << 20 : undefined, o); if (i) t.push(Number(process.hrtime.bigint() - s) / 1e6); }
  t.sort((x, y) => x - y); out[w + "." + a] = +t[t.length >> 1].toFixed(2);
}
console.log(JSON.stringify(out));
