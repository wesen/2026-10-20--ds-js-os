// Chapter 27: a file that computes at its top level: a table, a random number, a date. With a
// snapshot all of it is computed when the world is built, and must be what main would compute
// when the world starts: Math.random's seed and the clock are set only in $nwInit, after main.
const squares = [];
for (let i = 0; i < 40; i++) squares.push(i * i);
const r = Math.random();
const names = { a: "alpha", b: "beta" };
names.c = "gamma";
let count = 0;
service("topstate")
  .on("get", (s) => ({ sum: squares.reduce((a, b) => a + b, 0), r: r, keys: Object.keys(names).join(","), count: ++count }))
  .on("bump", (s) => { names["d" + count] = "delta"; return Object.keys(names).length; });
