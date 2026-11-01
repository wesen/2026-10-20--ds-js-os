// Power: the battery level and the screen backlight, both on the same STM32 as the keyboard
// (registers 0x0B and 0x05). It shares the I2C bus with the keyboard driver; the kernel serialises them.
const REG_BKL = 0x05, REG_BAT = 0x0b;

// write the register number, give the controller 2 ms to prepare, read: one transaction (see keyboard.js)
const readReg = (dev, reg) => dev.read(reg, 2, 2);

// The STM32 can stop answering (a reset of the P4 alone, mid-transaction, leaves it NACKing until the PicoCalc is
// power-cycled). A failed read is counted and logged once, as the keyboard driver does, instead of crashing the world
// every five seconds.
function failed(s, e) {
  s.errors++;
  if (e.message !== s.lastError) log("i2c:", e.message);
  s.lastError = e.message;
}

async function sample(s) {
  let v;
  try { [, v] = await readReg(s.dev, REG_BAT); } catch (e) { failed(s, e); return; }
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
  .state({ pct: -1, charging: false, backlight: 0, saved: 0, screen: true, errors: 0, lastError: "" })
  .onStart(async (s) => {
    s.dev = hw.i2c("i2c0:0x1f", 10000);
    await sleep(120);
    try { const [, v] = await readReg(s.dev, REG_BKL); s.backlight = s.saved = v; } catch (e) { failed(s, e); }
    await sample(s);
  })
  .every(5000, sample)
  // the screen is the compositor's to switch: it handles the power key; no other world may darken the panel
  .on("backlight", (s, p, msg) => { if (msg.from === "compositor") return setBacklight(s, Math.max(0, Math.min(255, (p && p.level) | 0))); })
  .on("screen", async (s, p, msg) => {
    if (msg.from !== "compositor") return { screen: s.screen };
    const on = p && p.on;
    s.screen = on === undefined ? !s.screen : !!on;
    if (!s.screen) s.saved = s.backlight || s.saved;
    await setBacklight(s, s.screen ? s.saved || 32 : 0);
    return { screen: s.screen };
  })
  .on("stats", (s) => ({ errors: s.errors, lastError: s.lastError }));
