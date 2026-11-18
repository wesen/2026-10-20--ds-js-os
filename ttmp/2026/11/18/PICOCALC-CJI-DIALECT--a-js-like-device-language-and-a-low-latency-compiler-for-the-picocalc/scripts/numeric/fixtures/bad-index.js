function half(x) { return x / 2; }
const values = [11, 22, 33];
console.log(values[half(2)]);
console.log(values[half(3)]);
values[half(3)] = 42;
console.log('unreachable');
