// Shared runtime for typed worlds. The compiled app chooses all metadata,
// content and event behavior. This layer translates counted UTF-16 to the SDK.
#include <stdint.h>
#include <string.h>
#include "nw.h"
#include "nw_json.h"
#include "nw_utf16.h"

enum { SCREEN_CAP = 16384, HINT_CAP = 120, LARGE_CAP = 65536, SMALL_CAP = 256 };
#define COUNTED(name, capacity) struct name { uint32_t length; uint16_t units[capacity]; }
static COUNTED(large_text, LARGE_CAP) large;
static COUNTED(small_text, SMALL_CAP) small[3];
static uint32_t world_state[64];
static const nw_event *current;
static struct { int32_t kind, ask, token, ok; } event_info;
static struct { uint32_t length; uint16_t units[SCREEN_CAP]; } output;
static struct { uint32_t length; uint16_t units[HINT_CAP]; } hints;
static char screen_bytes[SCREEN_CAP + 1], hint_bytes[HINT_CAP + 1];

int typedWorldMeta(int field, void *value);
int typedWorldEvent(const void *event, void *state, void *screen, void *hints);

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

#ifdef __wasm__
#define SDK(name) __attribute__((export_name(#name)))
#else
#define SDK(name)
#endif
SDK(typedSdkScreen)
int typedSdkScreen(const void *screen, int length, const void *hint, int hint_length)
{
    if (screen != &output || hint != &hints || length <= 0 || length > SCREEN_CAP ||
        hint_length < 0 || hint_length > HINT_CAP ||
        utf8(output.units, length, screen_bytes, sizeof screen_bytes) < 0 ||
        utf8(hints.units, hint_length, hint_bytes, sizeof hint_bytes) < 0) return -1;
    return nw_screen(screen_bytes, hint_bytes);
}

// The runtime owns the allocation; the typed program manages its contents and
// usage. Reading a writable buffer by slot restores its capacity header.
SDK(typedSdkBuffer) void *typedSdkBuffer(int slot)
{
    static uint32_t empty;
    if (slot == 0) { large.length = LARGE_CAP; return &large; }
    if (slot < 1 || slot > 3) return &empty;
    small[slot - 1].length = SMALL_CAP;
    return &small[slot - 1];
}

static int capacity(const void *buffer)
{
    if (buffer == &output) return SCREEN_CAP;
    if (buffer == &hints) return HINT_CAP;
    if (buffer == &large) return LARGE_CAP;
    for (unsigned i = 0; i < sizeof small / sizeof *small; i++)
        if (buffer == &small[i]) return SMALL_CAP;
    return -1;
}

SDK(typedSdkView) const void *typedSdkView(void *buffer, int length)
{
    static const uint32_t empty;
    if (length < 0 || length > capacity(buffer)) return &empty;
    *(uint32_t *)buffer = length;
    return buffer;
}

static int hex4(const unsigned char **input)
{
    const unsigned char *p = *input;
    int value = 0;
    for (int i = 0; i < 4; i++) {
        unsigned c = *p++;
        if (c >= '0' && c <= '9') c -= '0';
        else if ((c | 32) >= 'a' && (c | 32) <= 'f') c = (c | 32) - 'a' + 10;
        else return -1;
        value = value * 16 + c;
    }
    *input = p;
    return value;
}

static uint64_t widen_ascii(uint32_t bytes)
{
    return (bytes & UINT32_C(0xff)) | ((uint64_t)(bytes & UINT32_C(0xff00)) << 8) |
           ((uint64_t)(bytes & UINT32_C(0xff0000)) << 16) | ((uint64_t)(bytes >> 24) << 48);
}

static uint64_t has_zero_byte(uint64_t bytes)
{
    return (bytes - UINT64_C(0x0101010101010101)) & ~bytes & UINT64_C(0x8080808080808080);
}

static int json_text(const char *json, const char *end, uint16_t *units, int cap)
{
    if (!json || *json != '"') return -1;
    const unsigned char *p = (const unsigned char *)json + 1;
    int length = 0;
    while (*p != '"') {
        // Long ASCII runs are common in text files. Both targets are little
        // endian. memcpy permits unaligned input and output.
        if ((const unsigned char *)end - p >= 8 && cap - length >= 8) {
            uint64_t bytes;
            __builtin_memcpy(&bytes, p, sizeof bytes);
            if (!(bytes & UINT64_C(0x8080808080808080)) &&
                !has_zero_byte(bytes ^ UINT64_C(0x2222222222222222)) &&
                !has_zero_byte(bytes ^ UINT64_C(0x5c5c5c5c5c5c5c5c)) && !has_zero_byte(bytes)) {
                uint64_t first = widen_ascii((uint32_t)bytes), second = widen_ascii(bytes >> 32);
                __builtin_memcpy(units + length, &first, sizeof first);
                __builtin_memcpy(units + length + 4, &second, sizeof second);
                p += 8;
                length += 8;
                continue;
            }
        }
        int c;
        if (*p == '\\') {
            c = *++p;
            if (!c) return -1;
            p++;
            switch (c) {
                case 'n': c = '\n'; break;
                case 'r': c = '\r'; break;
                case 't': c = '\t'; break;
                case 'b': c = '\b'; break;
                case 'f': c = '\f'; break;
                case 'u':
                    c = hex4(&p);
                    if (c >= 0xd800 && c <= 0xdbff) {
                        if (*p++ != '\\' || *p++ != 'u') return -1;
                        int low = hex4(&p);
                        if (low < 0xdc00 || low > 0xdfff) return -1;
                        c = 0x10000 + ((c - 0xd800) << 10) + low - 0xdc00;
                    } else if (c >= 0xdc00 && c <= 0xdfff) return -1;
                    break;
                case '"': case '\\': case '/': break;
                default: return -1;
            }
        } else c = nw_utf8_next(&p);
        if (c < 0 || length + (c >= 0x10000 ? 2 : 1) > cap) return -1;
        if (c >= 0x10000) {
            c -= 0x10000;
            units[length++] = 0xd800 + (c >> 10);
            c = 0xdc00 + (c & 1023);
        }
        units[length++] = c;
    }
    return length;
}

static const uint16_t *units_at(const void *buffer)
{
    return (const uint16_t *)((const uint32_t *)buffer + 1);
}

static int event_key(const void *buffer, int length, char key[96])
{
    int cap = capacity(buffer);
    if (length < 1 || length > cap) return -1;
    return utf8(units_at(buffer), length, key, 96);
}

// 0: message type, 1: sender, 2: JSON string at the payload root,
// 3: JSON string in a named member of an object payload.
SDK(typedSdkEventText) int typedSdkEventText(int field, const void *key_buffer, int key_length, void *buffer)
{
    int cap = capacity(buffer);
    if (!current || cap < 0) return -1;
    uint16_t *units = (uint16_t *)((uint32_t *)buffer + 1);
    if (field == 0) return nw_utf16_decode(current->type, units, cap);
    if (field == 1) return nw_utf16_decode(current->from, units, cap);
    const char *end = current->json + current->json_len;
    if (field == 2) return json_text(current->json, end, units, cap);
    if (field != 3) return -1;
    char key[96];
    if (event_key(key_buffer, key_length, key) < 0) return -1;
    return json_text(nw_json_find(current->json, key), end, units, cap);
}

SDK(typedSdkEventHandle) int typedSdkEventHandle(const void *buffer, int length)
{
    char key[96];
    if (!current || event_key(buffer, length, key) < 0) return -1;
    const char *p = nw_json_find(nw_json_find(current->json, key), "$h");
    if (!p || *p < '0' || *p > '9') return -1;
    int handle = 0;
    do {
        int digit = *p++ - '0';
        if (handle > (INT32_MAX - digit) / 10) return -1;
        handle = handle * 10 + digit;
    } while (*p >= '0' && *p <= '9');
    p = nw_json__ws(p);
    return *p == '}' && handle > 0 ? handle : -1;
}

SDK(typedSdkFileRead) int typedSdkFileRead(int handle) { return nw_fs_read(handle, ""); }
SDK(typedSdkRelease) int typedSdkRelease(int handle) { return nw_release(handle); }
SDK(typedSdkYield) int typedSdkYield(void) { return nw_sleep(0); }
SDK(typedSdkReply) int typedSdkReply(const void *buffer, int length)
{
    if (length <= 0 || length > capacity(buffer) ||
        utf8(units_at(buffer), length, screen_bytes, sizeof screen_bytes) < 0) return -1;
    return nw_reply(screen_bytes);
}

int nw_on_event(const nw_event *event)
{
    output.length = SCREEN_CAP;
    hints.length = HINT_CAP;
    event_info.kind = event->kind;
    event_info.ask = !!event->ask;
    event_info.token = event->token;
    event_info.ok = !!event->ok;
    current = event;
    int result = typedWorldEvent(&event_info, world_state, &output, &hints);
    current = NULL;
    return result;
}
