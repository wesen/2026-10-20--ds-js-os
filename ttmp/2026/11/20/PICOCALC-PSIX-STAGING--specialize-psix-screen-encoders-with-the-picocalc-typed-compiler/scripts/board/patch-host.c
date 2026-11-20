#include <assert.h>
#define BX_NOW() 0
#include "binary_native.inc"
#include "binary_producer.inc"
#include "descriptor.h"
#include "patch.h"
#include "stage_churn.h"

static void canary(uint8_t buffer[STAGE_PATCH_CAP], unsigned seed)
{
    for (unsigned i = 0; i < STAGE_PATCH_CAP; ++i) buffer[i] = (uint8_t)(i * 131u + seed);
}

static void scrubbed(const struct stage_cache *cache)
{
    for (unsigned j = 0; j < 2; ++j) {
        const struct stage_patch_entry *entry = &cache->entries[j];
        if (!entry->bytes) continue;
        for (unsigned i = 0; i < 64; ++i) assert(entry->packet[entry->board_at + i] == 0);
        for (unsigned i = 0; i < 16; ++i) assert(entry->packet[entry->mask_at + i] == 0);
        unsigned tail = entry->body_at + sizeof stage_body;
        for (unsigned i = 0; i < STAGE_PATCH_FIELDS; ++i) {
            if (entry->key.wide & (1u << i)) {
                for (unsigned u = 0; u < 8; ++u) assert(entry->packet[tail + u] == 0);
                tail += 8;
            } else {
                assert(bx24(entry->packet + entry->body_at + stage_numbers[i]) == 0x300000);
            }
        }
        assert(tail == entry->bytes);
    }
}

static void good(struct stage_cache *cache, const struct stage_input *in,
                 const uint8_t *expected, size_t bytes, unsigned seed)
{
    uint8_t out[STAGE_PATCH_CAP], initial[STAGE_PATCH_CAP];
    canary(initial, seed);
    memcpy(out, initial, sizeof out);
    assert(stage_cached(cache, in, out, bytes) == (int)bytes);
    assert(!memcmp(out, expected, bytes));
    assert(!memcmp(out + bytes, initial + bytes, sizeof out - bytes));
    scrubbed(cache);
}

static void bad(struct stage_cache *cache, const struct stage_input *in, size_t limit, int result)
{
    uint8_t out[STAGE_PATCH_CAP], initial[STAGE_PATCH_CAP], copy[sizeof *cache];
    canary(initial, 43);
    memcpy(out, initial, sizeof out);
    memcpy(copy, cache, sizeof copy);
    assert(stage_cached(cache, in, out, limit) == result);
    assert(!memcmp(out, initial, sizeof out));
    assert(!memcmp(copy, cache, sizeof copy));
}

static uint8_t *generic(const struct stage_input *in, size_t *length)
{
    // Convert independently of stage_patch_read and stage_plan for the oracle.
    const char hex[] = "0123456789abcdef";
    char board[65] = {0}, mask[17] = {0};
    for (unsigned i = 0; i < 64; ++i) board[i] = hex[in->words[i]];
    for (unsigned i = 0; i < 8; ++i) {
        const unsigned n = in->words[64 + i];
        mask[2 * i] = hex[n / 16];
        mask[2 * i + 1] = hex[n % 16];
    }
    cJSON *object = cJSON_Parse(stage_cases[0].json);
    assert(object);
    cJSON *tree = cJSON_GetObjectItem(cJSON_GetObjectItem(object, "frame"), "tree");
    assert(cJSON_SetValuestring(cJSON_GetObjectItem(tree, "b"), board));
    assert(cJSON_SetValuestring(cJSON_GetObjectItem(tree, "m"), mask));
    cJSON *tuple = cJSON_GetObjectItem(tree, "f");
    for (unsigned i = 0; i < 9; ++i) {
        const int64_t m = in->words[72 + 2 * i] + (int64_t)in->words[73 + 2 * i] * 65536;
        cJSON_SetNumberValue(cJSON_GetArrayItem(tuple, (int)i), m < 2147483648 ? m : m - 4294967296);
    }
    size_t scratch = 0;
    uint8_t *wire = bp_encode(object, length, &scratch);
    cJSON_Delete(object);
    assert(wire);
    return wire;
}

static void number(struct stage_input *in, unsigned field, int32_t value)
{
    in->words[72 + 2 * field] = (uint16_t)value;
    in->words[73 + 2 * field] = (uint16_t)((uint32_t)value >> 16);
}

int main(void)
{
    struct stage_cache trace = {0}, chronological = {0}, churn = {0};
    enum { TRACE_COUNT = sizeof stage_cases / sizeof *stage_cases,
           REPLAY_COUNT = sizeof stage_patch_replay / sizeof *stage_patch_replay,
           CHURN_COUNT = sizeof stage_patch_churn / sizeof *stage_patch_churn };
    struct stage_patch_key classes[TRACE_COUNT];
    unsigned class_count = 0;
    for (unsigned i = 0; i < TRACE_COUNT; ++i) {
        const struct stage_input *in = &stage_cases[i].input;
        size_t length = 0;
        uint8_t *oracle = generic(in, &length);
        assert(length == stage_cases[i].length);
        assert(!memcmp(oracle, stage_cases[i].wire, length));
        good(&trace, in, oracle, length, i + 1);
        free(oracle);

        struct stage_patch_values value;
        assert(stage_patch_read(in, &value));
        unsigned j = 0;
        while (j < class_count && !stage_patch_same(classes[j], value.key)) ++j;
        if (j == class_count) classes[class_count++] = value.key;
    }
    for (unsigned i = 0; i < REPLAY_COUNT; ++i) {
        const struct stage_patch_fixture *r = &stage_patch_replay[i];
        good(&chronological, &r->input, r->wire, r->length, i + 15);
    }
    assert(chronological.hits == 16 && chronological.misses == 4);
    for (unsigned i = 0; i < 8 * CHURN_COUNT; ++i) {
        const struct stage_patch_fixture *r = &stage_patch_churn[i % CHURN_COUNT];
        good(&churn, &r->input, r->wire, r->length, i + 30);
    }
    assert(churn.hits == 0 && churn.misses == 8 * CHURN_COUNT);

    // The two one-wide cases share the same packet length yet put float tags in different slots.
    static const int32_t cases[][2] = {
        {524287, -524288}, {524288, 5}, {4, 524288}, {2147483647, -2147483647},
        {123, 524287}, {321, -524289}, {2147483647, 0}, {524288, 2147483647},
    };
    struct stage_cache widths = {0};
    for (unsigned i = 0; i < sizeof cases / sizeof *cases; ++i) {
        struct stage_input in = stage_patch_churn[i % CHURN_COUNT].input;
        number(&in, 7, cases[i][0]); number(&in, 8, cases[i][1]);
        for (unsigned j = 0; j < 3; ++j) {
            // Change data on hits. The hex edits preserve this state's string class.
            in.words[40] = j + 1;
            in.words[71] = in.words[74] == 64 ? 0 : (uint16_t)(54 + j);
            number(&in, 0, j + 5);
            if (cases[i][1] == -2147483647) number(&in, 8, cases[i][1] + j);
            size_t length;
            uint8_t *oracle = generic(&in, &length);
            assert(length == 313u + 8 * (unsigned)(cases[i][0] > 524287) +
                8 * (unsigned)(cases[i][1] > 524287 || cases[i][1] < -524288));
            uint8_t table[STAGE_PATCH_CAP];
            assert(stage_plan(&in, table, sizeof table) == (int)length);
            assert(!memcmp(oracle, table, length));
            good(&widths, &in, oracle, length, i + 10 * j);
            free(oracle);
        }
    }
    assert(widths.hits == 16 && widths.misses == 8);

    // Two warm entries survive invalid input and a short miss for a third class.
    struct stage_cache rejecting = {0};
    const struct stage_patch_fixture *a = &stage_patch_churn[0], *b = &stage_patch_churn[1],
                                     *c = &stage_patch_churn[2];
    good(&rejecting, &a->input, a->wire, a->length, 21);
    good(&rejecting, &b->input, b->wire, b->length, 22);
    bad(&rejecting, &a->input, a->length - 1, -2);
    bad(&rejecting, &c->input, c->length - 1, -2);
    static const struct { unsigned cell; uint16_t value; } mutations[] = {
        {0, 7}, {0, 8}, {0, 15}, {64, 256}, {72, 64}, {73, UINT16_MAX},
        {74, 65}, {76, 0}, {80, 9}, {82, 2}, {84, 33}, {87, UINT16_MAX}, {89, 32768},
    };
    for (unsigned i = 0; i < sizeof mutations / sizeof *mutations; ++i) {
        struct stage_input in = c->input;
        in.words[mutations[i].cell] = mutations[i].value;
        assert(stage_plan(&in, (uint8_t[STAGE_PATCH_CAP]){0}, STAGE_PATCH_CAP) == -1);
        bad(&rejecting, &in, STAGE_PATCH_CAP, -1);
    }
    struct stage_input invalid = a->input;
    invalid.words[64] = 1;
    bad(&rejecting, &invalid, STAGE_PATCH_CAP, -1);
    invalid = c->input;
    invalid.length = 89;
    bad(&rejecting, &invalid, STAGE_PATCH_CAP, -1);
    invalid.length = 91;
    bad(&rejecting, &invalid, STAGE_PATCH_CAP, -1);
    invalid = c->input;
    for (unsigned i = 0; i < 33; ++i) invalid.words[i] = 1;
    bad(&rejecting, &invalid, STAGE_PATCH_CAP, -1);
    good(&rejecting, &a->input, a->wire, a->length, 22);
    good(&rejecting, &b->input, b->wire, b->length, 23);
    assert(rejecting.hits == 2 && rejecting.misses == 2);

    // Input/output overlap is allowed. The cache itself lives separately.
    struct stage_cache alias = {0};
    union { struct stage_input input; uint8_t bytes[STAGE_PATCH_CAP]; } arena;
    for (unsigned i = 0; i < 2; ++i) {
        void *destination = arena.bytes;
        arena.input = b->input;
        assert(stage_cached(&alias, &arena.input, destination, sizeof arena.bytes) == (int)b->length);
        assert(!memcmp(destination, b->wire, b->length));
        scrubbed(&alias);
    }
    assert(alias.hits == 1 && alias.misses == 1);

    printf("{\"trace\":{\"calls\":%u,\"classes\":%u,\"hits\":%u,\"misses\":%u},"
           "\"chronological\":{\"calls\":%u,\"classes\":3,\"hits\":%u,\"misses\":%u},"
           "\"sampledCycle\":{\"calls\":%u,\"classes\":3,\"hits\":%u,\"misses\":%u},"
           "\"widthTransitions\":{\"calls\":%u,\"hits\":%u,\"misses\":%u},"
           "\"refusedUnmodified\":%zu,\"aliasByteMatches\":2,\"cacheBytes\":%zu}\n",
           TRACE_COUNT, class_count, trace.hits, trace.misses, REPLAY_COUNT, chronological.hits, chronological.misses,
           CHURN_COUNT * 8, churn.hits, churn.misses, widths.hits + widths.misses, widths.hits, widths.misses,
           6 + sizeof mutations / sizeof *mutations, sizeof trace);
}
