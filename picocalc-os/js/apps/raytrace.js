// Coordinates are in the 160-pixel orthographic image. The compositor owns the pixels.
const startScene = { sx: 68, sy: 61, lx: 31, ly: 25 };
const step = 8;
const sphere = (n) => Math.max(32, Math.min(127, n));
const light = (n) => Math.max(0, Math.min(159, n));

app("raytrace")
  .title("Ray Tracer")
  .key("v")
  .about("Move a sphere and aim the light across a checkerboard.")
  .icon([["line", 1, 24, 37, 24, "muted"], ["fill", 10, 8, 12, 16, "accent"],
         ["fill", 7, 11, 18, 10, "accent"], ["fill", 11, 11, 4, 4, "soft"],
         ["line", 26, 10, 32, 4, "warn"], ["line", 29, 13, 35, 7, "warn"]])
  .state(startScene)
  .on("key", (s, k, msg) => {
    if (msg.from !== "compositor" || k.state === "up") return;
    switch ((k.ch || k.key).toLowerCase()) {
      case "left":  s.sx = sphere(s.sx - step); break;
      case "right": s.sx = sphere(s.sx + step); break;
      case "up":    s.sy = sphere(s.sy - step); break;
      case "down":  s.sy = sphere(s.sy + step); break;
      case "a": s.lx = light(s.lx - step); break;
      case "d": s.lx = light(s.lx + step); break;
      case "w": s.ly = light(s.ly - step); break;
      case "s": s.ly = light(s.ly + step); break;
      case "r": Object.assign(s, startScene); break;
    }
  })
  .screen((s) => ({ t: "raytrace", sx: s.sx, sy: s.sy, lx: s.lx, ly: s.ly }))
  .hints("Arrows sphere  WASD light  R reset");
