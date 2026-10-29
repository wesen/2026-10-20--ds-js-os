// The display driver: the PaperS3's e-paper panel (epd0), and the refresh planner. The compositor gives it a
// read-only view of the framebuffer and asks it to present the rectangles that changed, with an intent:
//   "page"   a new screen: one clean, full, 16-gray refresh that also clears every ghost
//   "text"   content changed within a screen: 16 grays, a little ghosting
//   "quick"  small black-and-white changes (a clock, a tick): fast, more ghosting
//   "ink"    pen strokes: the fastest waveform
// A waveform pass takes as long whatever its size, so a present is one update covering all its rectangles
// (pixels inside it that did not change are driven to the level they already have and do not ghost).
// Partial updates leave ghosts, so after enough of them (count, area or age) the next present becomes a clean
// full refresh. The waveforms are the port's (M5GFX on the device, sim/papers3/epd.c on the host).
var MODE = { text: "text", quick: "fast", ink: "fastest" };

// the rectangles' union, widened to the alignment the panel's bus likes
function union(rects, align) {
  var x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  rects.forEach(function (r) { x0 = Math.min(x0, r[0]); y0 = Math.min(y0, r[1]); x1 = Math.max(x1, r[0] + r[2]); y1 = Math.max(y1, r[1] + r[3]); });
  x0 = Math.floor(x0 / align) * align; x1 = Math.ceil(x1 / align) * align;
  return [x0, y0, x1 - x0, y1 - y0];
}

function update(s, x, y, w, h, mode) {
  return s.epd.update(s.fb, x, y, w, h, mode).then(function (r) {
    s.counts[mode]++;
    s.busyMs += r.ms;
    return r.ms;
  });
}

driver("display")
  .state({
    ready: false, w: 540, h: 960,
    policy: { maxPartials: 32, maxAreaScreens: 16, maxAgeMs: 15 * 60000, align: 8 },
    partials: 0, partialArea: 0, lastClean: -1e12, presents: 0, cleans: 0, why: "",
    counts: { quality: 0, text: 0, fast: 0, fastest: 0 }, busyMs: 0,
  })
  .onStart(function (s) {
    s.epd = hw.epd("epd0");
    var info = s.epd.info();
    s.w = info.w; s.h = info.h;
    s.ready = true;
    // Back from a power-off: the glass shows the asleep screen, which the compositor adopts, so the first frame
    // needs no clean refresh; the ghosts counted before the power-off are still there. Used once.
    var g = store.get("ghosts");
    if (g) { s.partials = g.partials; s.partialArea = g.partialArea; s.lastClean = now(); store.remove("ghosts"); }
  })
  .on("suspend", function (s) { store.set("ghosts", { partials: s.partials, partialArea: s.partialArea }); })
  .on("resume", function () { store.remove("ghosts"); })
  .on("attach", function (s, m) {
    if (s.fb && s.fb !== m.fb) s.fb.release();
    s.fb = m.fb;
  })
  .on("present", function (s, m) {
    // after a restart, presents queued for the old instance can arrive before the compositor re-attaches
    if (!s.fb || !s.ready) return { skipped: true };
    s.presents++;
    var p = s.policy, t = now(), why = "";
    if (m.intent === "page" || m.clean) why = m.clean ? "asked" : "new page";
    else if (s.partials >= p.maxPartials) why = s.partials + " partial updates";
    else if (s.partialArea >= p.maxAreaScreens * s.w * s.h) why = "partial area";
    else if (t - s.lastClean >= p.maxAgeMs) why = s.lastClean < 0 ? "first frame" : "age";
    if (why) {
      s.why = why; s.cleans++;
      log("clean refresh: " + why);
      s.partials = 0; s.partialArea = 0; s.lastClean = t;
      return update(s, 0, 0, s.w, s.h, "quality").then(function (ms) { return { mode: "quality", why: why, ms: ms }; });
    }
    var mode = MODE[m.intent] || "text", r = union(m.rects, p.align);
    s.partials++;
    s.partialArea += r[2] * r[3];
    return update(s, r[0], r[1], r[2], r[3], mode).then(function (ms) { return { mode: mode, rect: r, ms: ms }; });
  })
  .on("policy", function (s, m) { assign(s.policy, m); return s.policy; })
  .on("stats", function (s) {
    return { presents: s.presents, cleans: s.cleans, partials: s.partials, partialArea: s.partialArea, why: s.why,
             counts: s.counts, busyMs: Math.round(s.busyMs), policy: s.policy, sinceCleanMs: Math.round(now() - s.lastClean) };
  });
