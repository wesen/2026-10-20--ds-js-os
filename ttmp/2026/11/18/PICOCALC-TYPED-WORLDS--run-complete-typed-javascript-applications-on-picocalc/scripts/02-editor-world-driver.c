#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "nw.h"
#include "nw_elf.h"
#include "nw_wire.h"
#include "expected.h"

int (*fw_entries[16])(int, char **);
uint32_t fw_sizes[16];
int fw_nentries;
static int declarations, frames;

const struct { const char *name; const void *address; } fw_resolve[] = {
    {"strlen", strlen}, {"memcpy", memcpy}, {"memset", memset},
};
const int fw_nresolve = sizeof fw_resolve / sizeof *fw_resolve;

static void expect(int ok, const char *what)
{
    if (!ok) { printf("failed: %s\n", what); exit(1); }
}

static int64_t kernel_call(int op, int a, int b, int64_t c, const char *s0, size_t n0,
                           const char *s1, size_t n1, const char *s2, size_t n2,
                           char *out, size_t out_n)
{
    (void)a; (void)b; (void)c; (void)n0; (void)n1; (void)s2; (void)n2; (void)out; (void)out_n;
    static const char *const fields[] = {"title", "key", "about", "icon"};
    static const char *const values[] = {"Editor", "e", "Plain text and Markdown, with find, soft wrap and a preview.",
        "[[\"rect\",8,0,24,30],[\"fill\",12,6,16,2],[\"fill\",12,12,16,2],[\"fill\",12,18,9,2],[\"fill\",23,16,2,7,\"accent\"]]"};
    switch (op) {
    case NW_CALL_KIND: expect(declarations++ == 0 && !strcmp(s0, "app"), "app kind"); return 0;
    case NW_CALL_PRESENT:
        expect(declarations >= 1 && declarations <= 4, "declaration count");
        expect(!strcmp(s0, fields[declarations - 1]) && !strcmp(s1, values[declarations - 1]), "typed presentation");
        declarations++;
        return 0;
    case NW_CALL_SCREEN:
        expect(!strcmp(s0, screen) && !strcmp(s1, "Esc Files"), "typed screen and hints");
        frames++;
        return 0;
    default: printf("unexpected opcode %d\n", op); exit(1);
    }
}

static int no_error(char *out, size_t n) { if (n) *out = 0; return 0; }

int main(void)
{
    static const nw_elf_kernel kernel = {NW_ELF_ABI, kernel_call, no_error};
    nw_elf_module world = {0};
    char *args[] = {(char *)&kernel, (char *)&world};
    expect(fw_nentries == 1 && !fw_entries[0](2, args) && world.abi == NW_ELF_ABI, "ELF module handshake");
    world.init();
    expect(declarations == 5, "all metadata");
    expect(world.event(NW_START, 0, 0, 0, "", "null", 4, "") == NW_DONE && frames == 1, "initial frame");
    expect(world.event(NW_TICK, 0, 0, 0, "", "null", 4, "") == NW_DONE && frames == 1, "no tick frame");
    puts("Typed Editor metadata and start frame passed");
    return 0;
}
