/* Measurement image only. Start with Enter on a selected white e-pawn. */
static struct {
  bool armed, running, white_seen;
  vtime_t started, cpu, engine, render, white_us;
  unsigned segments, settlements;
} chess_observation;

void chess_observe_arm(void) {
  if (chess_observation.running) { puts("CHESSBAD busy"); return; }
  memset(&chess_observation, 0, sizeof chess_observation);
  chess_observation.armed = true;
  puts("CHESSARM e2e4");
}

static void chess_observe_begin(const world_t *w, bool settlement) {
  if (!chess_observation.armed || settlement || strcmp(w->name, "chess") || !w->mbox) return;
  const msg_t *m = w->mbox;
  if (strcmp(m->type, "key") || !m->json || !strstr(m->json, "\"enter\"")
      || strstr(m->json, "\"state\":\"up\"")) return;
  chess_observation.armed = false;
  if (!w->frame || !strstr(w->frame, "White to move") || !strstr(w->frame, "#efc752")) {
    puts("CHESSBAD initial selection"); return;
  }
  chess_observation.started = K.vnow;
  chess_observation.cpu = w->cpu_us;
  chess_observation.engine = w->prof_engine_us;
  chess_observation.render = w->prof_render_us;
  chess_observation.running = true;
}

static void chess_observe_end(const world_t *w, bool settlement) {
  if (!chess_observation.running || strcmp(w->name, "chess")) return;
  chess_observation.segments++;
  if (settlement) chess_observation.settlements++;
  if (!w->frame) return;
  if (!chess_observation.white_seen) {
    if (settlement || !strstr(w->frame, "Last e2-e4") || !strstr(w->frame, "Black is thinking")) {
      puts("CHESSBAD white frame"); chess_observation.running = false; return;
    }
    chess_observation.white_seen = true;
    /* Preserve the first segment samples without printing inside the reply window. */
    chess_observation.white_us = port_clock() - chess_observation.started;
    return;
  }
  int depth, nodes, score;
  const char *reply = strstr(w->frame, "Last b8-c6");
  if (!reply || sscanf(reply, "Last b8-c6 Depth %d Nodes %d Eval %d", &depth, &nodes, &score) != 3) return;
  const vtime_t completed = port_clock();
  printf("CHESSRUN e2e4 b8c6 %d %d %d %lld %lld %lld %lld %lld %u %u\n", depth, nodes, score,
         (long long)chess_observation.white_us,
         (long long)(completed - chess_observation.started),
         (long long)(w->cpu_us - chess_observation.cpu),
         (long long)(w->prof_engine_us - chess_observation.engine),
         (long long)(w->prof_render_us - chess_observation.render),
         chess_observation.segments, chess_observation.settlements);
  chess_observation.running = false;
}
