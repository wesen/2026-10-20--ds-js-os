// The PicoCalc contract normalizes negative zero at an Int boundary.
function int(x /*: Int */) /*: Int */ { return x; }
function negate(x) { return -x; }
console.log(int(3));
console.log(int(4 / 2));
console.log(1 / int(negate(0)));
console.log(int(7 / 2));
console.log('unreachable');
