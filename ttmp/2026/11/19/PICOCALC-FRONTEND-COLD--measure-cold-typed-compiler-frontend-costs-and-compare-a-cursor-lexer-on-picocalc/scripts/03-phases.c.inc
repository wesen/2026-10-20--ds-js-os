enum {
  FRONT_READ, FRONT_REALM, FRONT_EVAL_WASM, FRONT_EVAL_RV32, FRONT_EVAL_LINKER,
  FRONT_ARGS, FRONT_DISPATCH, FRONT_PARSE, FRONT_MATCH, FRONT_TOKEN,
  FRONT_LOWER, FRONT_ASSEMBLE, FRONT_LINK, FRONT_COPY, FRONT_TEARDOWN,
  FRONT_PHASE_COUNT
};

static void front_switch(compile_heap *heap, unsigned phase) {
  vtime_t now = port_clock();
  heap->spent[heap->phase] += now - heap->since;
  heap->since = now;
  heap->phase = phase;
  ++heap->visits[phase];
  if (heap->phase_peak[phase] < heap->live) heap->phase_peak[phase] = heap->live;
}

static void front_enter(compile_heap *heap, unsigned phase) {
  if (heap->trace) front_switch(heap, phase);
}

static JSValue front_phase(JSContext *ctx, JSValueConst self, int argc, JSValueConst *argv) {
  int32_t phase;
  if (argc != 1 || JS_ToInt32(ctx, &phase, argv[0]) || phase < FRONT_DISPATCH || phase > FRONT_LINK)
    return JS_ThrowRangeError(ctx, "invalid frontend phase");
  front_switch(JS_GetContextOpaque(ctx), (unsigned)phase);
  return JS_UNDEFINED;
}
