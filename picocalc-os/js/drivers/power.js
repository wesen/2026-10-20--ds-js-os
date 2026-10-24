// Power: the battery level and the screen backlight, both on the same STM32 as the keyboard
// (registers 0x0B and 0x05). It shares the I2C bus with the keyboard driver; the kernel serialises them.
const REG_BKL = 0x05, REG_BAT = 0x0b;

// write the register number, give the controller 2 ms to prepare, read: one transaction (see keyboard.js)
const readReg = (dev, reg) => dev.read(reg, 2, 2);

async function sample(s) {
  const [, v] = await readReg(s.dev, REG_BAT);
  const pct = v & 0x7f, charging = !!(v & 0x80);
  if (pct !== s.pct || charging !== s.charging) {
    s.pct = pct; s.charging = charging;
    publish("power", { pct, charging, backlight: s.backlight, screen: s.screen });
  }
}

async function setBacklight(s, level) {
  await s.dev.transfer([REG_BKL | 0x80, level], 0);
  const [, v] = await readReg(s.dev, REG_BKL);
  s.backlight = v;
  publish("power", { pct: s.pct, charging: s.charging, backlight: s.backlight, screen: s.screen });
}

driver("power")
  .provides("power")
  .state({ pct: -1, charging: false, backlight: 0, saved: 0, screen: true })
  .onStart(async (s) => {
    s.dev = hw.i2c("i2c0:0x1f", 10000);
    await sleep(120);
    const [, v] = await readReg(s.dev, REG_BKL);
    s.backlight = s.saved = v;
    await sample(s);
  })
  .every(5000, sample)
  .on("backlight", (s, { level }) => setBacklight(s, Math.max(0, Math.min(255, level | 0))))
  .on("screen", async (s, { on }) => {
    s.screen = on === undefined ? !s.screen : !!on;
    if (!s.screen) s.saved = s.backlight || s.saved;
    await setBacklight(s, s.screen ? s.saved || 32 : 0);
    return { screen: s.screen };
  });
