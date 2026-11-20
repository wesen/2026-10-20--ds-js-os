// Drive the real Chess world from the opening; its engine chooses every black move.
import assert from "node:assert/strict";
import {mkdirSync, readFileSync, readdirSync, writeFileSync} from "node:fs";
import {join, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const day = resolve(here, "../../..");
const experiment = join(day, readdirSync(day).find(n => n.startsWith("PICOCALC-RENDER-CHESS--")), "scripts");
const {guest, worldBytes} = await import(pathToFileURL(join(experiment, "03-guest.mjs")));
const game = guest(worldBytes(readFileSync(join(experiment, "04-semantic-producer.typed"), "utf8")));
const out = process.argv[2];
assert(out, "usage: node 01-match.mjs OUTPUT");
mkdirSync(out, {recursive:true});
let last, yaw = 0, keys = ["h"];
function update(result) {
  if (result.screen) last = JSON.parse(result.screen[0]);
  return result;
}
update(game.launch());
const frames = [];
const arrows = ["up", "right", "down", "left"];
function event(key) {
  const viewIndex = arrows.indexOf(key);
  const gameKey = viewIndex < 0 ? key : arrows[(viewIndex - yaw + 4) % 4];
  keys.push(key);
  return update(game.key(gameKey));
}
function turn(key) {
  keys.push(key);
  yaw = (yaw + (key === "f4" ? 1 : 3)) % 4;
}
function snapshot(label, caption) {
  frames.push({label, caption, keys, yaw, board:last.b, masks:last.m, fields:last.f});
  keys = [];
}
const square = s => 8 * (8 - Number(s[1])) + s.charCodeAt(0) - 97;
const name = sq => String.fromCharCode(97 + sq % 8) + (8 - (sq >> 3));
function go(s) {
  const to = square(s), from = last.f[0];
  const axis = (d, positive, negative) => {
    const at = arrows.indexOf(d > 0 ? positive : negative);
    for (let i = 0; i < Math.abs(d); i++) event(arrows[(at + yaw) % 4]);
  };
  axis(to % 8 - from % 8, "right", "left");
  axis((to >> 3) - (from >> 3), "down", "up");
  assert.equal(last.f[0], to);
}
snapshot("opening", "Opening position");
const moves = ["e2e4", "g1f3", "f1c4", "e1g1"];
for (const [i, move] of moves.entries()) {
  const from = move.slice(0,2), to = move.slice(2);
  go(from); event("enter");
  assert.equal(last.f[1], square(from), "selection " + move);
  go(to);
  let result = event("enter");
  assert.deepEqual(last.f.slice(2,5), [square(from), square(to), 6], "move enters search " + move);
  let slices = 0;
  while (result.result === 1) {
    assert(++slices < 1000);
    result = update(game.wake());
  }
  const reply = name(last.f[2]) + name(last.f[3]);
  snapshot("turn-" + (i + 1), (i+1) + ". " + move + "   " + reply);
}
// Record four distinct views and a round trip, then prove selection survives an inverse turn.
for (let i = 1; i <= 4; i++) {
  turn("f4"); snapshot("yaw-" + i, "Same position / F4 x " + i);
}
go("g2"); event("enter"); assert.equal(last.f[1], square("g2"));
snapshot("selected", "g2 pawn selected");
turn("f3"); snapshot("selected-left", "F3 / same pawn and legal moves");
event("right"); assert.equal(last.f[0], square("g1")); // yaw 3: view-right -> board-down
snapshot("rotated-arrow", "View-right / cursor on g1");
writeFileSync(join(out, "match.json"), JSON.stringify(frames, null, 2) + "\n");
console.log(frames.map(f=>f.caption).join("\n"));
