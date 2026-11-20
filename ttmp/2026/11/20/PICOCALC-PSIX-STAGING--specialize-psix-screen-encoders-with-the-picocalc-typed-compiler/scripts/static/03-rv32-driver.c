#include <stdint.h>

enum { INPUT_CELLS = 90, OUTPUT_CELLS = 256 };
typedef struct { uint32_t length; uint16_t units[INPUT_CELLS]; } Input;
typedef struct { uint32_t length; uint16_t units[OUTPUT_CELLS]; } Output;
typedef struct {
    Input input;
    uint32_t length;
    uint8_t wire[2 * OUTPUT_CELLS];
} Test;

extern const Test fixtures_start[], fixtures_end[];
extern int32_t psixEncode(const Input *, Output *, int32_t);
static Output output = {OUTPUT_CELLS, {0}};
static volatile uint32_t checksum;

static uint64_t steps(void)
{
    register uint32_t a0 asm("a0");
    register uint32_t a1 asm("a1");
    register uint32_t a7 asm("a7") = 10;
    asm volatile("ecall" : "=r"(a0), "=r"(a1) : "r"(a7) : "memory");
    return ((uint64_t)a1 << 32) | a0;
}

static void print(const void *bytes, uint32_t size)
{
    register int a0 asm("a0") = 1;
    register const void *a1 asm("a1") = bytes;
    register uint32_t a2 asm("a2") = size;
    register int a7 asm("a7") = 2;
    asm volatile("ecall" : "+r"(a0) : "r"(a1), "r"(a2), "r"(a7) : "memory");
}

static void quit(int status)
{
    register int a0 asm("a0") = status;
    register int a7 asm("a7") = 1;
    asm volatile("ecall" : : "r"(a0), "r"(a7) : "memory");
    __builtin_unreachable();
}

void _start(void)
{
    const uint8_t *wire = (const uint8_t *)output.units;
    for (const Test *row = fixtures_start; row < fixtures_end; ++row) {
        for (unsigned i = 0; i < OUTPUT_CELLS; ++i) output.units[i] = 0xaaaa;
        if (psixEncode(&row->input, &output, row->length - 1) != -2) quit(1);
        for (unsigned i = 0; i < OUTPUT_CELLS; ++i) if (output.units[i] != 0xaaaa) quit(2);
        output.length = (row->length - 1) / 2;
        if (psixEncode(&row->input, &output, row->length) != -2) quit(3);
        for (unsigned i = 0; i < OUTPUT_CELLS; ++i) if (output.units[i] != 0xaaaa) quit(4);
        output.length = (row->length + 1) / 2;
        const int32_t length = psixEncode(&row->input, &output, row->length);
        if (length != (int32_t)row->length) quit(5);
        for (int32_t i = 0; i < length; ++i) if (wire[i] != row->wire[i]) quit(6);
        for (unsigned i = length; i < 2 * OUTPUT_CELLS; ++i) if (wire[i] != 0xaa) quit(7);
        output.length = OUTPUT_CELLS;
        uint64_t start = steps();
        const int32_t measured_length = psixEncode(&row->input, &output, 2 * OUTPUT_CELLS);
        const uint64_t count = steps() - start;
        if (measured_length != length) quit(8);
        checksum += wire[10] + measured_length;
        print(&count, sizeof count);
    }
    static const Input bad;
    for (unsigned i = 0; i < OUTPUT_CELLS; ++i) output.units[i] = 0xaaaa;
    if (psixEncode(&bad, &output, 2 * OUTPUT_CELLS) != -1) quit(9);
    for (unsigned i = 0; i < OUTPUT_CELLS; ++i) if (output.units[i] != 0xaaaa) quit(10);
    quit(0);
}
