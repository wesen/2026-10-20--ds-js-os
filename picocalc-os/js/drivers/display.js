// The display driver: the ST7365P panel on SPI2, written in JS from picocalc_lcd.c. It owns the SPI
// handle; the compositor gives it a read-only view of the framebuffer and asks it to flush rectangles.
const SWRESET = 0x01, SLPOUT = 0x11, INVON = 0x21, DISPON = 0x29, CASET = 0x2a, RASET = 0x2b, RAMWR = 0x2c, MADCTL = 0x36, COLMOD = 0x3a;
const span = (a, b) => [a >> 8, a & 0xff, b >> 8, b & 0xff];

driver("display")
  .state({ ready: false, flushes: 0, pixels: 0, busyMs: 0 })
  .onStart(async (s) => {
    s.spi = hw.spi("spi2", 40e6);   // 40 MHz: 80 MHz worked once but ghosted on the removable display
    await s.spi.cmd(SWRESET);
    await sleep(150);
    await s.spi.cmd(SLPOUT);
    await sleep(150);
    await s.spi.cmd(COLMOD, [0x55]);  // 16 bits per pixel, RGB565
    await sleep(10);
    await s.spi.cmd(MADCTL, [0x48]);  // column order mirrored (MX), BGR panel
    await s.spi.cmd(INVON);           // this panel shows true colours with inversion on
    await sleep(10);
    await s.spi.cmd(DISPON);
    await sleep(50);
    s.ready = true;
  })
  .on("attach", (s, { fb }) => {
    if (s.fb && s.fb !== fb) s.fb.release();
    s.fb = fb;
  })
  .on("flush", async (s, { rects }) => {
    // after a restart, flushes queued for the old instance can arrive before the compositor re-attaches
    if (!s.fb || !s.ready) return { px: 0, skipped: true };
    const t0 = now();
    const jobs = [];
    let px = 0;
    for (const [x, y, w, h] of rects) {
      // queued together: the transfers run back to back on the bus once this turn ends
      jobs.push(s.spi.cmd(CASET, span(x, x + w - 1)), s.spi.cmd(RASET, span(y, y + h - 1)), s.spi.cmd(RAMWR), s.spi.pixels(s.fb, x, y, w, h));
      px += w * h;
    }
    await Promise.all(jobs);
    s.flushes++;
    s.pixels += px;
    s.busyMs += now() - t0;
    return { px, ms: now() - t0 };
  });
