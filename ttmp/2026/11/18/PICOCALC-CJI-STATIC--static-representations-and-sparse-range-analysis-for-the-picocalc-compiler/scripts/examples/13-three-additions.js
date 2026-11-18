// Three different representation decisions for the same source operator.
function exact(x) { return x + 1; }
function floating(x) { return x + 0.5; }
function mixed(x) { return x + 1; }
console.log(exact(2), floating(2), mixed(2), mixed("2"));
