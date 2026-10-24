// The keyboard driver. The PicoCalc's keys are scanned by an STM32 that sits on I2C at 0x1F and keeps a
// FIFO of key events. This polls it the way the C driver in picocalc_keyboard.c does (write the register
// number, wait 2 ms, read the answer) and publishes each event on the "keys" channel.
const REG_KEY = 0x04, REG_FIF = 0x09;
const STATES = { 1: "down", 2: "hold", 3: "up" };
const NAMES = {
  0x0a: "enter", 0x08: "backspace", 0x09: "tab", 0xb1: "esc", 0xb4: "left", 0xb5: "up", 0xb6: "down", 0xb7: "right",
  0x90: "f10", 0x91: "power", 0xd0: "break", 0xd1: "insert", 0xd2: "home", 0xd4: "del", 0xd5: "end", 0xd6: "pgup", 0xd7: "pgdn",
  0xc1: "capslock", 0xa1: "alt", 0xa2: "shift", 0xa3: "shift", 0xa5: "ctrl", 0x20: "space",
};
for (let i = 1; i <= 9; i++) NAMES[0x80 + i] = "f" + i;

// The controller prepares its answer when the register number arrives and hands it over on the next
// read, so the write and the read must not be split by another driver's access to the same chip: the
// power driver reads the battery from it too. One transaction holds the bus for write, 2 ms, read.
const readReg = (dev, reg, n) => dev.read(reg, n, 2);

driver("keyboard")
  .provides("keys")
  .state({ polls: 0, events: 0, errors: 0, lastError: "" })
  .onStart(async (s) => {
    s.dev = hw.i2c("i2c0:0x1f", 10000);  // the controller runs its I2C at 10 kHz
    await sleep(100);                     // and wants 100 ms after reset before the first access
  })
  .every(20, async (s) => {
    if (!s.dev) return;
    s.polls++;
    try {
      const [status] = await readReg(s.dev, REG_KEY, 1);
      let count = status & 0x1f;
      while (count-- > 0) {
        const [state, code] = await readReg(s.dev, REG_FIF, 2);
        if (!state) break;
        const key = NAMES[code] || (code >= 0x20 && code < 0x7f ? String.fromCharCode(code) : "0x" + code.toString(16));
        const ch = code >= 0x20 && code < 0x7f ? String.fromCharCode(code) : "";
        s.events++;
        publish("keys", { code, key, ch, state: STATES[state] || String(state), caps: !!(status & 0x20) });
      }
    } catch (e) {
      s.errors++;
      if (e.message !== s.lastError) log("i2c:", e.message);
      s.lastError = e.message;
    }
  })
  .on("stats", (s) => ({ polls: s.polls, events: s.events, errors: s.errors, lastError: s.lastError }));
