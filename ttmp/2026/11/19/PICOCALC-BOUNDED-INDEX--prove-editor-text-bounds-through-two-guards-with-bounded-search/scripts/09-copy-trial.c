/* Each pass copies exactly 65,536 UTF-16 units through Editor's preview append
 * routine. Reset only the three state words that the routine uses. */
static bool preview_copy(void) {
    enum { UNITS=65536, CHUNK=48, RUNS=8 };
    struct counted { uint32_t length; uint16_t units[]; };
    struct counted *text = malloc(sizeof(*text) + UNITS * sizeof(uint16_t));
    if (!text) return false;
    text->length = UNITS;
    for (unsigned i=0; i<UNITS; ++i) text->units[i] = (uint16_t)(i ^ 0x8321);
    struct { uint32_t length; uint16_t units[100]; } rows = {.length=100};
    int32_t state[80] = {0};
    uint32_t results[RUNS][LANES];
    for (unsigned pass=0; pass<RUNS; ++pass) {
        for (unsigned order=0; order<LANES; ++order) {
            unsigned lane = (pass + (pass/LANES%2 ? LANES-order : order)) % LANES;
            uint32_t laps = 0;
            for (int pos=0; pos<UNITS; pos+=CHUNK) {
                int end = pos + CHUNK < UNITS ? pos+CHUNK : UNITS;
                state[PREVIEWUNITS] = state[PREVIEWCOLUMNS] = 0;
                uint32_t start = tick();
                int result = preview_copy_fns[lane](&rows, state, text, pos, end, end-pos);
                laps += tick()-start;
                if (result || state[PREVIEWUNITS] != end-pos || state[PREVIEWCOLUMNS] != end-pos ||
                    memcmp(rows.units+2, text->units+pos, (end-pos)*sizeof(uint16_t))) {
                    free(text);
                    return false;
                }
            }
            results[pass][lane] = laps;
        }
    }
    free(text);
    for (unsigned pass=0; pass<RUNS; ++pass)
        for (unsigned lane=0; lane<LANES; ++lane)
            printf("INDEXGUEST %u %s %u %" PRIu32 " %d\n",
                   pass, names[lane], UNITS, results[pass][lane], esp_clk_cpu_freq());
    return true;
}
