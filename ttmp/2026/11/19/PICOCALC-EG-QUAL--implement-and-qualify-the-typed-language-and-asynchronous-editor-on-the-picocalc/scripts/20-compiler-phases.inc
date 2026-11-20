// Measurement-only ESP32-P4 compiler timeline. No trace printing in the timer.
enum {
@PHASE_ENUM@
  EG_PHASE_COUNT
};

typedef struct {
  bool enabled;
  unsigned phase;
  vtime_t since, spent[EG_PHASE_COUNT];
  unsigned visits[EG_PHASE_COUNT];
} eg_compile_phase;

static void eg_phase_switch(eg_compile_phase *trace, unsigned phase) {
  if (!trace->enabled || phase == trace->phase) return;
  vtime_t now = port_clock();
  trace->spent[trace->phase] += now - trace->since;
  trace->since = now;
  trace->phase = phase;
  ++trace->visits[phase];
}

static JSValue eg_phase_marker(JSContext *ctx, JSValueConst self, int argc,
                               JSValueConst *argv) {
  (void)self;
  if (argc != 1 || JS_VALUE_GET_TAG(argv[0]) != JS_TAG_INT)
    return JS_ThrowTypeError(ctx, "expected integer compiler phase");
  int phase = JS_VALUE_GET_INT(argv[0]);
  if (phase < EG_NATIVE_SETUP || phase > EG_NATIVE_LINK)
    return JS_ThrowRangeError(ctx, "invalid compiler phase");
  eg_phase_switch(JS_GetContextOpaque(ctx), (unsigned)phase);
  return JS_UNDEFINED;
}

static void eg_phase_print(eg_compile_phase *trace, vtime_t finished,
                           vtime_t elapsed, bool success, size_t peak, size_t bytes) {
  if (!trace->enabled) return;
  trace->spent[trace->phase] += finished - trace->since;
  char line[1400];
  size_t at = 0;
#define EG_ADD(...) do { \
    int n = snprintf(line + at, sizeof line - at, __VA_ARGS__); \
    if (n < 0 || (size_t)n >= sizeof line - at) { puts("eg_compile_phase_v1 overflow"); return; } \
    at += (size_t)n; \
  } while (0)
  EG_ADD("eg_compile_phase_v1 {\"status\":\"%s\",\"total_us\":%lld,"
         "\"peak_js_bytes\":%zu,\"module_bytes\":%zu,\"phase_us\":[",
         success ? "ok" : "failed", (long long)elapsed, peak, bytes);
  for (unsigned i = 0; i < EG_PHASE_COUNT; ++i)
    EG_ADD("%s%lld", i ? "," : "", (long long)trace->spent[i]);
  EG_ADD("],\"visits\":[");
  for (unsigned i = 0; i < EG_PHASE_COUNT; ++i)
    EG_ADD("%s%u", i ? "," : "", trace->visits[i]);
  EG_ADD("]}");
#undef EG_ADD
  puts(line);
}
