function int(x /*: Int */) /*: Int */ { return x; }
function addOne(x) { return x + 1; }
console.log(int(0));
console.log(int(addOne(9007199254740991)));
console.log('unreachable');
