// Snake, on the virtual clock: the game ticks every 110 ms while it is in front and pauses when it is
// not. Food is placed with Math.random, which the prelude seeds per world, so a recorded game replays.
const CW = 22, CH = 18, CELL = 13;
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };

function reset(s) {
  s.body = [[6, 8], [5, 8], [4, 8], [3, 8]];
  s.dir = [1, 0]; s.next = [1, 0];
  s.score = 0; s.alive = true; s.ticks = 0;
  place(s);
}
function place(s) {
  for (;;) {
    const f = [Math.floor(Math.random() * CW), Math.floor(Math.random() * CH)];
    if (!s.body.some(([x, y]) => x === f[0] && y === f[1])) { s.food = f; return; }
  }
}
function step(s) {
  s.dir = s.next;
  const [hx, hy] = s.body[0];
  const head = [hx + s.dir[0], hy + s.dir[1]];
  const eats = head[0] === s.food[0] && head[1] === s.food[1];
  const body = eats ? s.body : s.body.slice(0, -1);   // the tail moves out of the way unless the snake grows
  if (head[0] < 0 || head[1] < 0 || head[0] >= CW || head[1] >= CH || body.some(([x, y]) => x === head[0] && y === head[1])) {
    s.alive = false;
    s.best = Math.max(s.best, s.score);
    return;
  }
  s.body.unshift(head);
  if (eats) { s.score += 10; place(s); }
  else s.body.pop();
}

// The autopilot: a breadth-first search from each possible next cell gives the distance to the food
// and how much room is left; it takes the shortest way to the food among the moves that leave room for
// the whole snake, or else the move with the most room. Typed arrays keep it to a few ms a tick.
const grid = new Uint8Array(CW * CH), dist = new Int16Array(CW * CH), queue = new Int16Array(CW * CH);
function search(s, start) {
  dist.fill(-1);
  let head = 0, tail = 0, room = 0, food = Infinity;
  const target = s.food[1] * CW + s.food[0];
  dist[start] = 0; queue[tail++] = start;
  while (head < tail) {
    const c = queue[head++], d = dist[c], x = c % CW;
    room++;
    if (c === target && d < food) food = d;
    if (x > 0 && !grid[c - 1] && dist[c - 1] < 0) { dist[c - 1] = d + 1; queue[tail++] = c - 1; }
    if (x < CW - 1 && !grid[c + 1] && dist[c + 1] < 0) { dist[c + 1] = d + 1; queue[tail++] = c + 1; }
    if (c >= CW && !grid[c - CW] && dist[c - CW] < 0) { dist[c - CW] = d + 1; queue[tail++] = c - CW; }
    if (c < CW * (CH - 1) && !grid[c + CW] && dist[c + CW] < 0) { dist[c + CW] = d + 1; queue[tail++] = c + CW; }
  }
  return { room, food };
}
function autopilot(s) {
  const [hx, hy] = s.body[0];
  let best = null, bestKey = null;
  for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (d[0] === -s.dir[0] && d[1] === -s.dir[1]) continue;
    const nx = hx + d[0], ny = hy + d[1];
    if (nx < 0 || ny < 0 || nx >= CW || ny >= CH) continue;
    const eats = nx === s.food[0] && ny === s.food[1];
    grid.fill(0);
    const n = eats ? s.body.length : s.body.length - 1;   // the tail moves away unless the snake grows
    for (let i = 0; i < n; i++) grid[s.body[i][1] * CW + s.body[i][0]] = 1;
    if (grid[ny * CW + nx]) continue;
    const r = search(s, ny * CW + nx);
    const key = r.room >= s.body.length + 1 ? [1, -r.food] : [0, r.room];
    if (!bestKey || key[0] > bestKey[0] || (key[0] === bestKey[0] && key[1] > bestKey[1])) { bestKey = key; best = d; }
  }
  if (best) s.next = best;
}

app("snake")
  .title("Snake")
  .state({ focused: false, best: 0, auto: false })
  .onStart(reset)
  .on("focus", (s) => { s.focused = true; })
  .on("blur", (s) => { s.focused = false; })
  .every(110, (s) => { if (s.focused && s.alive) { s.ticks++; if (s.auto) autopilot(s); step(s); } })
  .on("key", (s, k) => {
    const d = DIRS[k.key] || (k.ch !== "p" && DIRS[k.ch]);
    if (d && (d[0] !== -s.dir[0] || d[1] !== -s.dir[1])) s.next = d;
    if (d) s.auto = false;
    if (k.ch === "p") s.auto = !s.auto;
    if (k.key === "enter" && !s.alive) reset(s);
  })
  .screen((s) => {
    const ops = [];
    for (let i = s.body.length - 1; i >= 0; i--) {  // tail first, so the head is drawn on top
      const [x, y] = s.body[i];
      ops.push(["fill", x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2, i === 0 ? "accent" : "ink"]);
    }
    const [fx, fy] = s.food;
    ops.push(["fill", fx * CELL + 3, fy * CELL + 3, CELL - 6, CELL - 6, "accent"], ["rect", fx * CELL + 1, fy * CELL + 1, CELL - 2, CELL - 2, "accent"]);
    if (!s.alive) {
      const bw = 190, bx = (CW * CELL - bw) >> 1, by = 70;
      ops.push(["fill", bx, by, bw, 78, "ink"], ["text", bx + 52, by + 12, "GAME OVER", "l", "accentInk"],
        ["text", bx + 16, by + 42, `score ${s.score}   best ${s.best}`, "s", "faint"], ["text", bx + 40, by + 58, "⏎ to play again", "s", "accentInk"]);
    }
    return ui.col({ gap: 6 },
      ui.row(ui.text(`score ${s.score}`, { font: "mb", w: 104 }), ui.text(`${s.auto ? "auto · " : ""}length ${s.body.length} · best ${Math.max(s.best, s.score)}`, { font: "s", color: s.auto ? "accent" : "muted", align: "right", pad: 3 })),
      ui.canvas(CW * CELL, CH * CELL, ops, { bg: "#ffffff", border: "line" }),
    );
  })
  .hints((s) => (s.alive ? "←→↑↓ or wasd steer  p autopilot" : "⏎ play again"));
