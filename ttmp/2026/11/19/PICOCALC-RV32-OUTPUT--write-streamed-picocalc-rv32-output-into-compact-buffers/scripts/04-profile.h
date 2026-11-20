// Included once by the generated profiling copy of typed_p4.c.
// This executable runs exactly one compilation per process.
enum { JS_PHASES = 7, PHASE_RUNTIME = 7, PHASE_ARGUMENTS, PHASE_HANDOFF, PHASE_TEARDOWN, PHASE_COUNT };

static struct phase {
  vtime_t elapsed;
  size_t entry, exit, peak, updates;
  unsigned runs;
} phases[PHASE_COUNT];

static int active_phase = -1;
static vtime_t phase_started;

static void profile_enter(int next, size_t live) {
  const vtime_t now = port_clock();
  if (active_phase >= 0) {
    phases[active_phase].elapsed += now - phase_started;
    phases[active_phase].exit = live;
  }
  if (next >= 0) {
    struct phase *phase = &phases[next];
    if (!phase->runs) phase->entry = live;
    phase->runs++;
    if (live > phase->peak) phase->peak = live;
  }
  active_phase = next;
  phase_started = now;
}

static void profile_alloc(size_t live) {
  struct phase *phase = &phases[active_phase];
  if (live > phase->peak) phase->peak = live;
  phase->updates++;
}

static JSValue output_phase(JSContext *ctx, JSValueConst self, int argc, JSValueConst *argv) {
  int32_t next;
  if (argc != 1 || JS_ToInt32(ctx, &next, argv[0]) || next < 0 || next >= JS_PHASES)
    return JS_ThrowTypeError(ctx, "invalid output profiling phase");
  compile_heap *heap = JS_GetRuntimeOpaque(JS_GetRuntime(ctx));
  profile_enter(next, heap->live);
  return JS_UNDEFINED;
}

static void profile_report(size_t live) {
  profile_enter(-1, live);
  for (int i = 0; i < PHASE_COUNT; i++) {
    const struct phase *phase = &phases[i];
    printf("output phase=%d us=%lld entry=%zu exit=%zu peak=%zu updates=%zu runs=%u\n",
        i, (long long)phase->elapsed, phase->entry, phase->exit, phase->peak,
        phase->updates, phase->runs);
  }
}
