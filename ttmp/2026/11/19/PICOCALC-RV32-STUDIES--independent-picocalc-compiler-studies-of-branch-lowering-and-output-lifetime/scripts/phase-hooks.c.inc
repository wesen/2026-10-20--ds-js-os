static void switch_phase(compile_heap *heap, unsigned phase) {
  vtime_t now = port_clock();
  heap->spent[heap->phase] += now - heap->since;
  heap->phase = phase;
  heap->since = now;
  heap->visits[phase]++;
  if (heap->phase_peak[phase] < heap->live) heap->phase_peak[phase] = heap->live;
}

static JSValue output_phase(JSContext *ctx, JSValueConst self, int argc, JSValueConst *argv) {
  int32_t phase;
  if (argc != 1 || JS_ToInt32(ctx, &phase, argv[0]) || phase < 0 || phase > 6)
    return JS_ThrowRangeError(ctx, "invalid output phase");
  switch_phase(JS_GetContextOpaque(ctx), (unsigned)phase);
  return JS_UNDEFINED;
}
