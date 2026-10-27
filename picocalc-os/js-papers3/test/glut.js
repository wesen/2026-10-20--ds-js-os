// Runs out of its arena once, then behaves.
var big = [];
service("glut").state({}).onStart(function () {
  if (now() < 100) for (;;) big.push("some text that takes room " + big.length);
  log("glut started again with " + big.length + " items");
});
