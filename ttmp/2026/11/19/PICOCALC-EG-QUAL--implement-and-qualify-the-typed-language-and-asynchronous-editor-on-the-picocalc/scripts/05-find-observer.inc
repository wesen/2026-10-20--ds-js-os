// Included in the research kernel, next to run_segment. All timestamps are P4 microseconds.
static struct {
  bool armed, running;
  char key[10], prompt[48], status[64];
  vtime_t start, cpu, engine;
  unsigned segments, settlements;
} find_observation;

void eg_find_arm(const char *args) {
  char which[10], file[18], extra;
  if (sscanf(args, "%9s %17s %c", which, file, &extra) != 2 ||
      (strcmp(which, "early") && strcmp(which, "late") && strcmp(which, "miss"))) {
    puts("EGBAD arm arguments"); return;
  }
  if (find_observation.armed || find_observation.running) { puts("EGBAD busy"); return; }
  memset(&find_observation, 0, sizeof find_observation);
  snprintf(find_observation.key, sizeof find_observation.key, "%s", which);
  const char *query = !strcmp(which,"early") ? "ext" : !strcmp(which,"late") ? "needle" : "text text z";
  snprintf(find_observation.prompt, sizeof find_observation.prompt, "Find: %s_", query);
  if (!strcmp(which,"miss")) snprintf(find_observation.status, sizeof find_observation.status, "Not found: %s", query);
  else snprintf(find_observation.status, sizeof find_observation.status, "%s  %s", file, !strcmp(which,"early") ? "1:2" : "852:1");
  find_observation.armed = true;
  printf("EGARM %s\n", which);
}

static void eg_find_begin(const world_t *w, bool settlement) {
  if (!find_observation.armed || settlement || strcmp(w->name, "editor") || !w->mbox) return;
  const msg_t *message = w->mbox;
  if (strcmp(message->type, "key") || !message->json || !strstr(message->json, "\"enter\"")) return;
  find_observation.armed = false;
  if (!w->frame || !strstr(w->frame,find_observation.prompt)) { puts("EGBAD prompt"); return; }
  find_observation.start = K.vnow;
  find_observation.cpu = w->cpu_us;
  find_observation.engine = w->prof_engine_us;
  find_observation.running = true;
}

static void eg_find_end(const world_t *w, bool settlement) {
  if (!find_observation.running || strcmp(w->name, "editor")) return;
  ++find_observation.segments;
  if (settlement) ++find_observation.settlements;
  if (!w->frame || !strstr(w->frame, find_observation.status)) return;
  vtime_t end = port_clock();
  printf("EGFIND %s %lld %lld %lld %u %u\n", find_observation.key,
         (long long)(end-find_observation.start), (long long)(w->cpu_us-find_observation.cpu),
         (long long)(w->prof_engine_us-find_observation.engine), find_observation.segments,
         find_observation.settlements);
  find_observation.running = false;
}
