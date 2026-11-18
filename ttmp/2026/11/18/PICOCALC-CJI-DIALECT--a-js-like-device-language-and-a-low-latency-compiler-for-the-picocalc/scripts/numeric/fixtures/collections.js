function key(x) { return -x; }
function roundOff(x) { return x + 2; }
const k = key(0);
const n = roundOff(9007199254740991);
const m = new Map();
m.set(k, 'zero');
m.set(n, 'first');
m.set(9007199254740992, 'second');
const s = new Set([k, 0, n, 9007199254740992]);
console.log(m.size);
console.log(m.get(0));
console.log(m.get(n));
console.log(s.size);
console.log(1 / Array.from(m.keys())[0]);
console.log(1 / Array.from(s)[0]);
const xs = [1, 2];
let indexCalls = 0;
function index() { indexCalls++; return 1; }
xs[index()] += 2;
console.log(indexCalls);
console.log(xs[1]);
