function add(x, y) { return x + y; }
function sub(x, y) { return x - y; }
function mul(x, y) { return x * y; }
function neg(x) { return -x; }
function rem(x, y) { return x % y; }
const max = 9007199254740991;
console.log(add(max, 2) === 9007199254740992);
console.log(add(max, 2) - max);
console.log(sub(-max, 2) === -9007199254740992);
console.log(mul(max, 3) === 27021597764222972);
console.log(1 / neg(0));
console.log(1 / mul(-2, 0));
console.log(1 / rem(-4, 2));
console.log((4294967295 >>> 0) + 1);
console.log((4294967295 >>> 0) * 1024);
console.log((4294967295 >>> 0) % 10);
console.log((~-2147483648) - -2147483648);
console.log(1 / (0 - 0));
console.log(1 / (0 * -1));
console.log(1 / (0 * 1));
console.log(1 / Math.min(0, -0));
console.log(1 / Math.max(0, -0));
