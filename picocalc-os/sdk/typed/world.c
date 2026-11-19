// Shared runtime for typed worlds. The compiled app chooses all metadata,
// content and event behavior. This layer translates counted UTF-16 to the SDK.
#include <stdint.h>
#include "nw.h"

enum { SCREEN_CAP = 16384, HINT_CAP = 120 };
static struct { uint32_t length; uint16_t units[SCREEN_CAP]; } output;
static struct { uint32_t length; uint16_t units[HINT_CAP]; } hints;
static char screen_bytes[SCREEN_CAP + 1], hint_bytes[HINT_CAP + 1];

int typedWorldMeta(int field, void *value);
int typedWorldEvent(int kind, void *screen, void *hints);

// Return the byte count, or -1 if the string cannot cross the SDK boundary.
static int utf8(const uint16_t *units, int length, char *out, int capacity)
{
    int count = 0;
    for (int i = 0; i < length; i++) {
        unsigned point = units[i];
        if (point >= 0xd800 && point <= 0xdbff) {
            if (++i == length || units[i] < 0xdc00 || units[i] > 0xdfff) return -1;
            point = 0x10000 + ((point - 0xd800) << 10) + (units[i] - 0xdc00);
        } else if (!point || (point >= 0xdc00 && point <= 0xdfff)) return -1;
        int bytes = point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
        if (bytes >= capacity - count) return -1;
        if (bytes == 1) out[count++] = point;
        else {
            static const unsigned prefix[] = {0, 0, 0xc0, 0xe0, 0xf0};
            out[count++] = prefix[bytes] | (point >> (6 * (bytes - 1)));
            for (int shift = 6 * (bytes - 2); shift >= 0; shift -= 6)
                out[count++] = 0x80 | ((point >> shift) & 63);
        }
    }
    out[count] = 0;
    return count;
}

void nw_init(void)
{
    static int (*const declare[])(const char *) = {nw_kind, nw_title, nw_key, nw_about, nw_icon};
    for (unsigned field = 0; field < sizeof declare / sizeof *declare; field++) {
        output.length = SCREEN_CAP;
        int length = typedWorldMeta(field, &output);
        if (length <= 0) continue;
        if (length > SCREEN_CAP || utf8(output.units, length, screen_bytes, sizeof screen_bytes) < 0 ||
            declare[field](screen_bytes) < 0) nw_log("typed world metadata rejected");
    }
}

int nw_on_event(const nw_event *event)
{
    output.length = SCREEN_CAP;
    hints.length = HINT_CAP;
    hints.units[0] = 0;
    int length = typedWorldEvent(event->kind, &output, &hints);
    if (length <= 0) return NW_DONE;
    int hint_length = 0;
    while (hint_length < HINT_CAP && hints.units[hint_length]) hint_length++;
    if (length > SCREEN_CAP || utf8(output.units, length, screen_bytes, sizeof screen_bytes) < 0 ||
        utf8(hints.units, hint_length, hint_bytes, sizeof hint_bytes) < 0 ||
        nw_screen(screen_bytes, hint_bytes) < 0) nw_log("typed world screen rejected");
    return NW_DONE;
}
