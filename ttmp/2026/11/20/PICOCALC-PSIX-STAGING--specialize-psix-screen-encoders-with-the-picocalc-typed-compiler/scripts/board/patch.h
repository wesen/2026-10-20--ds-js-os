// Fixed two-entry LRU for canonical PSIX layouts. Include after descriptor.h.
enum { STAGE_PATCH_CAP = 576, STAGE_PATCH_FIELDS = 9 };
struct stage_patch_key {
    uint16_t wide;
    uint8_t board_rank, mask_rank, board_first;
};
struct stage_patch_entry {
    struct stage_patch_key key;
    uint16_t bytes, board_at, mask_at, body_at;
    uint8_t packet[STAGE_PATCH_CAP];
};
struct stage_cache {
    unsigned hits, misses;
    unsigned recent;
    struct stage_patch_entry entries[2];
};
struct stage_patch_values {
    char board[65], mask[17];
    int32_t numbers[STAGE_PATCH_FIELDS];
    struct stage_patch_key key;
};

static unsigned stage_patch_rank(const char *text)
{
    unsigned lo = 0, hi = sizeof stage_vocab / sizeof *stage_vocab;
    while (lo < hi) {
        const unsigned mid = lo + (hi - lo) / 2;
        if (strcmp(stage_vocab[mid], text) < 0) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

static bool stage_patch_read(const struct stage_input *in, struct stage_patch_values *value)
{
    static const char hex[] = "0123456789abcdef";
    if (in->length != 90) return false;
    for (unsigned i = 0; i < STAGE_PATCH_FIELDS; ++i) {
        const uint16_t *words = in->words + 72 + 2 * i;
        value->numbers[i] = (int32_t)((uint32_t)words[0] | ((uint32_t)words[1] << 16));
    }
    const int32_t *n = value->numbers;
    if (n[0] < 0 || n[0] > 63 || n[1] < 0 || n[1] > 64 ||
        n[2] < 0 || n[2] > 64 || n[3] < 0 || n[3] > 64 || (n[2] == 64) != (n[3] == 64) ||
        n[4] < 0 || n[4] > 8 || n[5] < 0 || n[5] > 1 || n[6] < 0 || n[6] > 32 ||
        n[7] < 0 || n[8] == INT32_MIN) return false;

    unsigned occupied = 0;
    for (unsigned i = 0; i < 64; ++i) {
        const unsigned piece = in->words[i];
        if (piece > 14 || piece == 7 || piece == 8) return false;
        occupied += piece != 0;
        value->board[i] = hex[piece];
    }
    if (occupied > 32) return false;
    value->board[64] = 0;
    for (unsigned i = 0; i < 8; ++i) {
        const unsigned mask = in->words[64 + i];
        if (mask > 255 || (n[1] == 64 && mask != 0)) return false;
        value->mask[2 * i] = hex[mask >> 4];
        value->mask[2 * i + 1] = hex[mask & 15];
    }
    value->mask[16] = 0;

    struct stage_patch_key *key = &value->key;
    key->board_rank = stage_patch_rank(value->board);
    key->mask_rank = stage_patch_rank(value->mask);
    key->board_first = key->board_rank < key->mask_rank ||
        (key->board_rank == key->mask_rank && strcmp(value->board, value->mask) < 0);
    key->wide = 0;
    for (unsigned i = 0; i < STAGE_PATCH_FIELDS; ++i)
        if (n[i] < -524288 || n[i] > 524287) key->wide |= 1u << i;
    return true;
}

static bool stage_patch_same(struct stage_patch_key a, struct stage_patch_key b)
{
    return a.wide == b.wide && a.board_rank == b.board_rank &&
        a.mask_rank == b.mask_rank && a.board_first == b.board_first;
}

static void stage_patch_fill(const struct stage_patch_entry *entry, const struct stage_patch_values *value,
                             uint8_t *output)
{
    memcpy(output, entry->packet, entry->bytes);
    memcpy(output + entry->board_at, value->board, 64);
    memcpy(output + entry->mask_at, value->mask, 16);
    unsigned tail = entry->body_at + sizeof stage_body;
    for (unsigned i = 0; i < STAGE_PATCH_FIELDS; ++i) {
        if (entry->key.wide & (1u << i)) {
            const double d = value->numbers[i];
            memcpy(output + tail, &d, sizeof d);
            tail += sizeof d;
        } else {
            const unsigned slot = entry->body_at + stage_numbers[i];
            bp_ref(output + slot, 3, (uint32_t)value->numbers[i] & 0xfffff);
        }
    }
}

// The canonical fixed Chess vocabulary is disjoint from both hex alphabets
// at their exact widths. The mask can be a strict prefix of the board.
static void stage_patch_remember(struct stage_patch_entry *entry, struct stage_patch_key key,
                                 uint8_t *packet, unsigned bytes)
{
    const unsigned board_id = key.board_rank + !key.board_first;
    const unsigned mask_id = key.mask_rank + key.board_first;
    const unsigned count = bx16(packet + 8);
    const unsigned body = bx16(packet + 13 + 2 * count);
    const unsigned board_at = bx16(packet + 13 + 2 * board_id);
    const unsigned mask_at = bx16(packet + 13 + 2 * mask_id);

    // Scrub the local construction buffer before retaining any of its bytes.
    // A wide slot keeps its address and tag. Its numeric payload is patched on use.
    memset(packet + board_at, 0, 64);
    memset(packet + mask_at, 0, 16);
    unsigned tail = body + sizeof stage_body;
    for (unsigned i = 0; i < STAGE_PATCH_FIELDS; ++i) {
        if (key.wide & (1u << i)) {
            memset(packet + tail, 0, 8);
            tail += 8;
        } else {
            bp_ref(packet + body + stage_numbers[i], 3, 0);
        }
    }
    memcpy(entry->packet, packet, bytes);
    entry->key = key;
    entry->bytes = bytes;
    entry->board_at = board_at;
    entry->mask_at = mask_at;
    entry->body_at = body;
}

// Cache storage is private. The caller's output may overlap the input. A
// refused call touches neither the output nor the cache, including its counters.
static int stage_cached(struct stage_cache *cache, const struct stage_input *in,
                        uint8_t *output, size_t capacity)
{
    struct stage_patch_values value;
    if (!stage_patch_read(in, &value)) return -1;
    for (unsigned i = 0; i < 2; ++i) {
        const struct stage_patch_entry *entry = &cache->entries[i];
        if (!entry->bytes || !stage_patch_same(entry->key, value.key)) continue;
        if (capacity < entry->bytes) return -2;
        stage_patch_fill(entry, &value, output);
        cache->recent = i;
        ++cache->hits;
        return entry->bytes;
    }

    uint8_t packet[STAGE_PATCH_CAP];
    const int bytes = stage_plan(in, packet, capacity < sizeof packet ? capacity : sizeof packet);
    if (bytes < 0) return bytes;
    // stage_plan has finished reading the input. We can publish before scrubbing.
    memcpy(output, packet, (size_t)bytes);
    const unsigned slot = cache->entries[cache->recent].bytes ? cache->recent ^ 1u : cache->recent;
    stage_patch_remember(&cache->entries[slot], value.key, packet, (unsigned)bytes);
    cache->recent = slot;
    ++cache->misses;
    return bytes;
}
