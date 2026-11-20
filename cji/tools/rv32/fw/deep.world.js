// CJI-4 (chapter 30): a world that recurses as deep as it is asked, to see a root stack chosen when the
// world is built (slas-rv32 --rootstack): each level keeps an object across its call, so each holds a
// root slot. Past the root stack's end it must crash ("root stack overflow"), not write past it.
function depth(n) {
  const o = { n: n };
  return n === 0 ? 0 : 1 + depth(n - 1) + (o.n - n);
}
service("deep").on("down", (s, { n }) => depth(n));
