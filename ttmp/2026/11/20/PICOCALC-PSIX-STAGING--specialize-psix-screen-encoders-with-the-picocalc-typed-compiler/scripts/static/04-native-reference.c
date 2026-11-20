// Reuse the BINARY experiment's unchanged resident cJSON-to-PSIX encoder.
#define BX_NOW() 0ULL
#include "native/02-native.inc"
#include "producer/binary_producer.inc"

int main(void)
{
    char json[4096];
    while (fgets(json, sizeof json, stdin)) {
        cJSON *tree = cJSON_Parse(json);
        if (!tree) return 1;
        size_t bytes, scratch;
        uint8_t *wire = bp_encode(tree, &bytes, &scratch);
        bx_data checked;
        if (!wire || !bx_open(&checked, wire, bytes)) return 2;
        const uint8_t length[] = {(uint8_t)bytes, (uint8_t)(bytes >> 8)};
        if (fwrite(length, 1, sizeof length, stdout) != sizeof length ||
            fwrite(wire, 1, bytes, stdout) != bytes) return 3;
        free(wire);
        cJSON_Delete(tree);
    }
    return ferror(stdin) ? 4 : 0;
}
