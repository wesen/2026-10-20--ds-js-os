// The Candela gallery (PICOCALC-CANDELA-GALLERY): Candela's presets, path-traced by the firmware on the handheld.
//
// This world only asks for the screen. The firmware's renderer (port/esp32p4/main/candela_gallery_p4.c) draws the
// image: the compositor, patched when the gallery is built in, draws this world's frame with
// fb.raytrace(skip, 0, 0, 0, 1000), which shows the renderer's newest frame with a caption. The renderer changes scene
// on its own (after 64 samples per pixel, or a minute on screen); skip moves to the next (Right) or the previous
// (Left) scene at once. seq changes so that the compositor repaints and new passes appear: four times a second for
// two seconds after the gallery opens or a key changes the scene (the first images), then twice a second (each
// repaint copies the 320 x 320 frame, so fewer leave more of core 1 to the renderer; the renderer itself shows a new
// pass at most every 0.4 s).
//
// The keyboard may be off, so the gallery comes to the front by itself after boot, until someone leaves it.
const OPEN_TRIES = 30;

app("gallery")
  .title("Candela")
  .key("p")
  .about("Path-traced Candela scenes, rendered here.")
  .icon([["fill", 0, 22, 40, 8, "muted"], ["fill", 13, 6, 14, 14, "accent"], ["fill", 10, 9, 20, 8, "accent"],
         ["fill", 15, 9, 4, 4, "soft"], ["line", 30, 4, 36, 0, "warn"], ["line", 33, 7, 39, 3, "warn"]])
  .state({ seq: 0, skip: 0, focused: false, left: false, tries: 0, tick: 0, fast: 8 })
  .onStart((s) => { send("compositor", "open", { app: "gallery" }); s.tries = 1; })
  .on("focus", (s) => { s.focused = true; s.fast = 8; })
  .on("blur", (s) => { s.focused = false; s.left = true; })
  .on("key", (s, k, msg) => {
    if (msg.from !== "compositor" || k.state === "up") return;
    const key = String(k.ch || k.key || "").toLowerCase();
    if (key === "right" || key === "down" || key === "n" || key === " " || key === "enter") { s.skip++; s.fast = 8; }
    else if (key === "left" || key === "up" || key === "b") { s.skip--; s.fast = 8; }
  })
  .every(250, (s) => {
    s.tick = (s.tick + 1) % 1000000000;
    if (s.fast > 0) s.fast--;
    if (s.fast > 0 || s.tick % 2 === 0) s.seq = (s.seq + 1) % 1000000000;
    if (!s.focused && !s.left && s.tries < OPEN_TRIES && s.tick % 4 === 0) {
      send("compositor", "open", { app: "gallery" });
      s.tries++;
    }
  })
  .screen((s) => ({ t: "gallery", seq: s.seq, skip: s.skip }))
  .hints("Left/Right scene  F1 home");
