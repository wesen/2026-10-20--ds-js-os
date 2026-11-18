// A message contains the fixed seed. "state" reads the completed batch outside the timed call.
const AG_LINE = /^(\s*)- (?:\[([ xX])\] )?(.*)$/;
function agToggled(line) {
  const m = AG_LINE.exec(line);
  if (!m) return line;
  const done = m[2] === "x" || m[2] === "X";
  return m[1] + "- [" + (done ? " " : "x") + "] " + m[3];
}

service("bench").state({ checksum: 0 }).on("mix", (s, seed) => {
  let x = seed | 0;
  for (let i = 0; i < 1024; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
  }
  s.checksum = x & 0x7fffffff;
}).on("array", (s, size) => {
  const values = [];
  for (let i = 0; i < size; i++) values.push((i * 31 + 17) & 255);
  let sum = 0;
  for (let pass = 0; pass < 8; pass++) {
    for (let i = 0; i < values.length; i++) sum += values[i];
  }
  s.checksum = sum;
}).on("edit", (s, seed) => {
  const lines = ["- alpha", "- [x] beta", "  - [ ] gamma"];
  for (let i = 0; i < 24; i++) {
    const pos = (seed + i) % 3;
    lines[pos] = agToggled(lines[pos]);
  }
  let sum = 0;
  for (let i = 0; i < lines.length; i++) {
    for (let j = 0; j < lines[i].length; j++) sum = (sum * 31 + lines[i].charCodeAt(j)) & 0x7fffffff;
  }
  s.checksum = sum;
}).on("state", (s) => s.checksum);
