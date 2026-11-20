static char *compile_synthetic(size_t *length) {
    static const p4_compile_limits limits = {.heap_bytes = 4 * 1024 * 1024, .duration_us = 6000000};
    static const char unused_reactor;
    const vtime_t started = port_clock();
    size_t source_length = 0;
    char *source = p4_bundle_read("selector/source", &source_length, NULL, 0);
    if (!source) return NULL;
    char *image = p4_typed_compile("synthetic", "bundle", source, source_length, "selector/link",
                                  "compileSelectorSynthetic", ENG_NATIVE, &unused_reactor, 1,
                                  length, started, &limits);
    free(source);
    return image;
}
