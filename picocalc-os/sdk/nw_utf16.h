#pragma once
#include <stdint.h>

// Strict UTF-8 decoding. Offsets in the compiled record count UTF-16 units.
static inline int nw_utf16_decode(const char *text, uint16_t *units, unsigned capacity)
{
    const unsigned char *p = (const unsigned char *)text;
    unsigned length = 0;
    while (*p) {
        uint32_t cp = *p++;
        unsigned extra = 0;
        uint32_t minimum = 0;
        if (cp >= 0xf0 && cp <= 0xf4) {
            cp &= 7;
            extra = 3;
            minimum = 0x10000;
        } else if (cp >= 0xe0 && cp <= 0xef) {
            cp &= 15;
            extra = 2;
            minimum = 0x800;
        } else if (cp >= 0xc2 && cp <= 0xdf) {
            cp &= 31;
            extra = 1;
            minimum = 0x80;
        } else if (cp >= 0x80) {
            return -1;
        }
        while (extra--) {
            if ((*p & 0xc0) != 0x80) return -1;
            cp = (cp << 6) | (*p++ & 63);
        }
        if (cp < minimum || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return -1;
        if (length + (cp >= 0x10000 ? 2 : 1) > capacity) return -1;
        if (cp >= 0x10000) {
            cp -= 0x10000;
            units[length++] = 0xd800 + (cp >> 10);
            cp = 0xdc00 + (cp & 1023);
        }
        units[length++] = cp;
    }
    return (int)length;
}
