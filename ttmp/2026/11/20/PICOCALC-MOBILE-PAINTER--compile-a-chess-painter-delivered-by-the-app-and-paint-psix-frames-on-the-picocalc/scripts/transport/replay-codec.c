#include "chess-psix.h"

#include <assert.h>
#include <stdio.h>
#include <string.h>

static unsigned read16(FILE *stream)
{
    int first = fgetc(stream);
    if (first == EOF) return 0;
    int second = fgetc(stream);
    assert(second != EOF);
    return first | (unsigned)second << 8;
}

int main(void)
{
    uint8_t packet[CHESS_PSIX_MAX], bitmap[CHESS_PSIX_MAX], encoded[CHESS_PSIX_MAX + 1];
    uint16_t expected[CHESS_PSIX_CELLS], decoded[CHESS_PSIX_CELLS], sentinel[CHESS_PSIX_CELLS];
    memset(sentinel, 0xa5, sizeof sentinel);
    unsigned records = 0, flips = 0, accepted_flips = 0, truncations = 0;
    for (unsigned length; (length = read16(stdin)); records++) {
        assert(length <= CHESS_PSIX_MAX);
        for (unsigned i = 0; i < CHESS_PSIX_CELLS; i++) expected[i] = read16(stdin);
        assert(fread(packet, 1, length, stdin) == length);
        assert(fread(bitmap, 1, length, stdin) == length);

        memset(encoded, 0xa5, sizeof encoded);
        assert(chess_psix_encode(expected, encoded, length - 1) == 0);
        for (unsigned i = 0; i < sizeof encoded; i++) assert(encoded[i] == 0xa5);
        assert(chess_psix_encode(expected, encoded, length) == length);
        assert(!memcmp(packet, encoded, length) && encoded[length] == 0xa5);
        assert(chess_psix_decode(packet, length, decoded));
        assert(!memcmp(decoded, expected, sizeof decoded));

        for (unsigned i = 0; i < length; i++, truncations++) {
            memcpy(decoded, sentinel, sizeof decoded);
            assert(!chess_psix_decode(packet, i, decoded));
            assert(!memcmp(decoded, sentinel, sizeof decoded));
        }
        for (unsigned i = 0; i < length; i++) {
            for (unsigned bit = 1; bit <= 128; bit *= 2, flips++) {
                packet[i] ^= bit;
                memcpy(decoded, sentinel, sizeof decoded);
                bool actual = chess_psix_decode(packet, length, decoded);
                assert(actual == !!(bitmap[i] & bit));
                if (actual) {
                    assert(chess_psix_encode(decoded, encoded, length) == length);
                    assert(!memcmp(packet, encoded, length));
                    accepted_flips++;
                } else {
                    assert(!memcmp(decoded, sentinel, sizeof decoded));
                }
                packet[i] ^= bit;
            }
        }
    }
    assert(feof(stdin));
    printf("{\"records\":%u,\"flips\":%u,\"acceptedFlips\":%u,\"truncations\":%u}\n",
           records, flips, accepted_flips, truncations);
    return records ? 0 : 1;
}
