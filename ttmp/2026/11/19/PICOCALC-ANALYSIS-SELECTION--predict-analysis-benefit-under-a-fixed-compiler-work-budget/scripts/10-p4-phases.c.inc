enum { SELECT_SETUP, SELECT_DISPATCH, SELECT_FEATURES, SELECT_ORDER, SELECT_NATIVE, SELECT_PHASES };

static void select_enter(compile_heap *heap, unsigned phase) {
  vtime_t now = port_clock();
  heap->spent[heap->phase] += now - heap->since;
  heap->since = now;
  heap->phase = phase;
  heap->start[phase] = heap->live;
  heap->top[phase] = heap->live;
}

static JSValue p4_selector_phase(JSContext *ctx, JSValueConst self, int argc, JSValueConst *argv) {
  compile_heap *heap = JS_GetContextOpaque(ctx);
  int32_t phase;
  if (argc != 1 || JS_ToInt32(ctx, &phase, argv[0]) || phase < SELECT_FEATURES ||
      phase > SELECT_NATIVE || (unsigned)phase <= heap->phase)
    return JS_ThrowRangeError(ctx, "invalid selector phase");
  select_enter(heap, (unsigned)phase);
  return JS_UNDEFINED;
}

static JSValue p4_selector_summary(JSContext *ctx, JSValueConst self, int argc, JSValueConst *argv) {
  compile_heap *heap = JS_GetContextOpaque(ctx);
  uint32_t values[4];
  if (argc != 4) return JS_ThrowRangeError(ctx, "invalid selector summary");
  for (unsigned i = 0; i < 4; i++)
    if (JS_ToUint32(ctx, &values[i], argv[i])) return JS_EXCEPTION;
  heap->cells = values[0];
  heap->comparisons = values[1];
  heap->retained = values[2];
  heap->proof_visits = values[3];
  return JS_UNDEFINED;
}
