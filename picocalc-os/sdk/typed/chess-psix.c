#include "chess-psix.h"

#include <limits.h>
#include <string.h>

/* The PSIX v1 envelope and Chess ABI used by the semantic screen replay. */
static const uint8_t magic[] = {'P', 'S', 'I', 'X', 1, 0};
static const char digest[] = "63d752c673c41636e4951c0f9a95ba7b7f69f698d98ed723e39037a3bc7fb026";
static const char hex[] = "0123456789abcdef";
enum {
    EMPTY, PROCEDURE, TITLE_VALUE, APP, BOARD_KEY, APP_VALUE, FIELDS_KEY,
    FRAME, HINTS, MASK_KEY, PROCEDURE_KEY, TITLE, TREE, VERSION, BOARD, MASK, STRINGS,
    HEADER = 13, DIRECTORY_END = HEADER + 2 * (STRINGS + 1), ROOT_SLOT = 10,
    ROOT_BYTES = 17, FRAME_BYTES = 12, TREE_BYTES = 27, FIELDS_BYTES = 29,
    BODY_BYTES = ROOT_BYTES + FRAME_BYTES + TREE_BYTES + FIELDS_BYTES,
    FIELD_COUNT = 9, INT_MIN20 = -524288, INT_MAX20 = 524287,
    TAG_INT = 3, TAG_DOUBLE = 4, TAG_STRING = 5, TAG_ARRAY = 6, TAG_OBJECT = 7,
    PAYLOAD = 0xfffff,
};

static bool piece_valid(unsigned piece)
{
    return piece <= 6 || (piece >= 9 && piece <= 14);
}

static bool fields_valid(const int32_t v[FIELD_COUNT])
{
    return v[0] >= 0 && v[0] < 64 &&
           v[1] >= 0 && v[1] <= 64 && v[2] >= 0 && v[2] <= 64 && v[3] >= 0 && v[3] <= 64 &&
           v[4] >= 0 && v[4] <= 8 && v[5] >= 0 && v[5] <= 1 &&
           v[6] >= 0 && v[6] <= 32 && v[7] >= 0 && v[8] >= -INT32_MAX;
}

static unsigned read16(const uint8_t *bytes)
{
    return bytes[0] | (unsigned)bytes[1] << 8;
}

static unsigned read24(const uint8_t *bytes)
{
    return read16(bytes) | (unsigned)bytes[2] << 16;
}

static void write16(uint8_t *bytes, unsigned value)
{
    bytes[0] = value;
    bytes[1] = value >> 8;
}

static void reference(uint8_t *bytes, unsigned tag, unsigned value)
{
    write16(bytes, value);
    bytes[2] = tag << 4 | value >> 16;
}

static void field(uint8_t *bytes, unsigned id, unsigned tag, unsigned value)
{
    write16(bytes, id);
    reference(bytes + 2, tag, value);
}

static void double_write(uint8_t *bytes, double value)
{
    uint64_t bits;
    memcpy(&bits, &value, sizeof bits);
    for (unsigned i = 0; i < 8; i++) bytes[i] = bits >> (8 * i);
}

static double double_read(const uint8_t *bytes)
{
    uint64_t bits = 0;
    double value;
    for (unsigned i = 0; i < 8; i++) bits |= (uint64_t)bytes[i] << (8 * i);
    memcpy(&value, &bits, sizeof value);
    return value;
}

_Static_assert(sizeof(double) == sizeof(uint64_t), "PSIX needs a 64-bit double");

size_t chess_psix_encode(const uint16_t cells[CHESS_PSIX_CELLS], uint8_t *packet, size_t capacity)
{
    char board[65], mask[17];
    for (unsigned i = 0; i < 64; i++) {
        if (!piece_valid(cells[i])) return 0;
        board[i] = hex[cells[i]];
    }
    for (unsigned i = 0; i < 8; i++) {
        if (cells[64 + i] > 255) return 0;
        mask[i * 2] = hex[cells[64 + i] >> 4];
        mask[i * 2 + 1] = hex[cells[64 + i] & 15];
    }
    board[64] = mask[16] = '\0';

    int32_t values[FIELD_COUNT];
    unsigned wide = 0;
    for (unsigned i = 0; i < FIELD_COUNT; i++) {
        uint32_t bits = cells[72 + 2 * i] | (uint32_t)cells[73 + 2 * i] << 16;
        memcpy(&values[i], &bits, sizeof bits);
        wide += values[i] < INT_MIN20 || values[i] > INT_MAX20;
    }
    if (!fields_valid(values)) return 0;

    const char *const strings[STRINGS] = {
        "", digest, "Chess", "app", "b", "chess", "f", "frame", "hints", "m", "p", "title", "tree", "v",
        board, mask,
    };
    unsigned order[STRINGS], ids[STRINGS], sizes[STRINGS];
    size_t body = DIRECTORY_END;
    for (unsigned i = 0; i < STRINGS; i++) {
        sizes[i] = strlen(strings[i]);
        body += sizes[i];
        unsigned j = i;
        while (j > 0 && strcmp(strings[order[j - 1]], strings[i]) > 0) {
            order[j] = order[j - 1];
            j--;
        }
        order[j] = i;
    }
    size_t total = body + BODY_BYTES + 8 * wide;
    if (total > capacity || total > CHESS_PSIX_MAX) return 0;

    memcpy(packet, magic, sizeof magic);
    write16(packet + 6, total);
    write16(packet + 8, STRINGS);
    reference(packet + ROOT_SLOT, TAG_OBJECT, body);
    unsigned start = DIRECTORY_END;
    for (unsigned i = 0; i < STRINGS; i++) {
        unsigned s = order[i];
        ids[s] = i;
        write16(packet + HEADER + 2 * i, start);
        memcpy(packet + start, strings[s], sizes[s]);
        start += sizes[s];
    }
    write16(packet + HEADER + 2 * STRINGS, start);

    uint8_t *root = packet + body;
    uint8_t *frame = root + ROOT_BYTES;
    uint8_t *tree = frame + FRAME_BYTES;
    uint8_t *tuple = tree + TREE_BYTES;
    write16(root, 3);
    field(root + 2, ids[APP], TAG_STRING, ids[APP_VALUE]);
    field(root + 7, ids[FRAME], TAG_OBJECT, frame - packet);
    field(root + 12, ids[TITLE], TAG_STRING, ids[TITLE_VALUE]);
    write16(frame, 2);
    field(frame + 2, ids[HINTS], TAG_STRING, ids[EMPTY]);
    field(frame + 7, ids[TREE], TAG_OBJECT, tree - packet);
    write16(tree, 5);
    field(tree + 2, ids[BOARD_KEY], TAG_STRING, ids[BOARD]);
    field(tree + 7, ids[FIELDS_KEY], TAG_ARRAY, tuple - packet);
    field(tree + 12, ids[MASK_KEY], TAG_STRING, ids[MASK]);
    field(tree + 17, ids[PROCEDURE_KEY], TAG_STRING, ids[PROCEDURE]);
    field(tree + 22, ids[VERSION], TAG_INT, 1);
    write16(tuple, FIELD_COUNT);
    unsigned tail = body + BODY_BYTES;
    for (unsigned i = 0; i < FIELD_COUNT; i++) {
        uint8_t *slot = tuple + 2 + i * 3;
        if (values[i] >= INT_MIN20 && values[i] <= INT_MAX20) {
            reference(slot, TAG_INT, (uint32_t)values[i] & PAYLOAD);
        } else {
            reference(slot, TAG_DOUBLE, tail);
            double_write(packet + tail, values[i]);
            tail += 8;
        }
    }
    return total;
}

static int nibble(uint8_t byte)
{
    if (byte >= '0' && byte <= '9') return byte - '0';
    if (byte >= 'a' && byte <= 'f') return byte - 'a' + 10;
    return -1;
}

bool chess_psix_decode(const uint8_t *packet, size_t length, uint16_t cells[CHESS_PSIX_CELLS])
{
    if (!packet || !cells || length < DIRECTORY_END + BODY_BYTES || length > CHESS_PSIX_MAX ||
        memcmp(packet, magic, sizeof magic) || read16(packet + 6) != length ||
        read16(packet + 8) != STRINGS || read16(packet + HEADER) != DIRECTORY_END) return false;

    unsigned body = read16(packet + HEADER + 2 * STRINGS);
    if (body < DIRECTORY_END || body + BODY_BYTES > length) return false;
    const uint8_t *board = NULL, *mask = NULL;
    for (unsigned i = 0; i < STRINGS; i++) {
        unsigned start = read16(packet + HEADER + 2 * i);
        unsigned end = read16(packet + HEADER + 2 * (i + 1));
        if (start < DIRECTORY_END || end < start || end > body) return false;
        const uint8_t *text = packet + start;
        if (end - start == 64 && memcmp(text, digest, 64)) board = text;
        if (end - start == 16) mask = text;
    }
    if (!board || !mask) return false;

    uint16_t decoded[CHESS_PSIX_CELLS];
    for (unsigned i = 0; i < 64; i++) {
        int piece = nibble(board[i]);
        if (piece < 0 || !piece_valid(piece)) return false;
        decoded[i] = piece;
    }
    for (unsigned i = 0; i < 8; i++) {
        int hi = nibble(mask[2 * i]), lo = nibble(mask[2 * i + 1]);
        if (hi < 0 || lo < 0) return false;
        decoded[64 + i] = 16 * hi + lo;
    }

    const uint8_t *slot = packet + body + ROOT_BYTES + FRAME_BYTES + TREE_BYTES + 2;
    unsigned tail = body + BODY_BYTES;
    for (unsigned i = 0; i < FIELD_COUNT; i++, slot += 3) {
        unsigned ref = read24(slot), arg = ref & PAYLOAD;
        int32_t value;
        if (ref >> 20 == TAG_INT) {
            value = arg <= INT_MAX20 ? (int32_t)arg : (int32_t)arg - (PAYLOAD + 1);
        } else {
            if (ref >> 20 != TAG_DOUBLE || arg != tail || tail + 8 > length) return false;
            double d = double_read(packet + tail);
            if (!(d >= -INT32_MAX && d <= INT32_MAX)) return false;
            value = (int32_t)d;
            tail += 8;
        }
        decoded[72 + 2 * i] = (uint16_t)value;
        decoded[73 + 2 * i] = (uint32_t)value >> 16;
    }
    /* Reconstruction checks canonical refs, dictionary order, and every literal byte. */
    uint8_t canonical[CHESS_PSIX_MAX];
    if (tail != length || chess_psix_encode(decoded, canonical, sizeof canonical) != length ||
        memcmp(packet, canonical, length)) return false;
    memcpy(cells, decoded, sizeof decoded);
    return true;
}
