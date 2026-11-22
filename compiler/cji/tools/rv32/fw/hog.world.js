// CJI-4 (chapter 30): a world that holds more memory at every "grow", to see a world's mem_kb on the
// board in the emulator: what the runtime allocates for it goes through its module's malloc, which the
// kernel charges to it and refuses past its limit. It must crash alone, with "out of memory" in its log.
const held = [];
service("hog").on("grow", (s) => {
  for (let i = 0; i < 64; i++) {
    const a = [];
    for (let k = 0; k < 64; k++) a.push(k);
    held.push(a);
  }
  return held.length;
});
