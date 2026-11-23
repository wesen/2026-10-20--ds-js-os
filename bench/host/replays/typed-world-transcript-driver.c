/* Runs a typed world's RV32 ELF on rv32emu against a scripted kernel and prints every system call as a JSON line.
 * typed-world-transcript.mjs runs the same script against the world's WebAssembly build with the same kernel rules
 * and compares the two transcripts. script.h (generated) holds the events and the clock. */
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "nw.h"
#include "nw_elf.h"
#include "nw_wire.h"
#include "script.h"

int (*fw_entries[16])(int, char **);
uint32_t fw_sizes[16];
int fw_nentries;

extern int64_t __divdi3(int64_t, int64_t);
const struct { const char *name; const void *address; } fw_resolve[] = {
    {"strlen", strlen}, {"memcpy", memcpy}, {"memset", memset}, {"memmove", memmove},
    {"snprintf", snprintf}, {"__divdi3", __divdi3},
};
const int fw_nresolve = sizeof fw_resolve / sizeof *fw_resolve;

static int step, handles = 20, tokens = 100;
static char stored[16385];

static void text(const char *s, size_t n)
{
    putchar('"');
    for (size_t i = 0; s && i < n; i++) {
        unsigned char c = (unsigned char)s[i];
        if (c == '"' || c == '\\') printf("\\%c", c);
        else if (c < 32) printf("\\u%04x", c);
        else putchar(c);
    }
    putchar('"');
}

/* The rules typed-world-transcript.mjs's kernel follows. */
static int64_t kernel_call(int op, int a, int b, int64_t c, const char *s0, size_t n0,
                           const char *s1, size_t n1, const char *s2, size_t n2,
                           char *out, size_t out_n)
{
    printf("[%d,%d,%d,%lld,", op, a, b, (long long)c);
    text(s0, n0);
    putchar(',');
    text(s1, n1);
    putchar(',');
    text(s2, n2);
    puts("]");
    switch (op) {
    case NW_CALL_NOW: return (int64_t)step * 1000000;
    case NW_CALL_CLOCK_WALL: return WALL < 0 ? -1 : WALL + (int64_t)step * 1000;
    case NW_CALL_CLOCK_TODAY: return TODAY;
    case NW_CALL_CLOCK_OFFSET: return OFFSET + 1440;
    case NW_CALL_CLOCK_ZONE: snprintf(out, out_n, "%s", ZONE); return (int64_t)strlen(ZONE);
    case NW_CALL_STORE_LOAD: snprintf(out, out_n, "%s", stored); return (int64_t)strlen(stored);
    case NW_CALL_STORE_SAVE: snprintf(stored, sizeof stored, "%s", s0); return 0;
    case NW_CALL_FS_OPEN: case NW_CALL_FS_AT: return handles++;
    case NW_CALL_FS_READ: case NW_CALL_FS_WRITE: case NW_CALL_FS_OP: case NW_CALL_ASK_FILE: case NW_CALL_ASK:
    case NW_CALL_SLEEP: return tokens++;
    default: return 0;
    }
}

static int no_error(char *out, size_t n) { if (n) *out = 0; return 0; }

int main(void)
{
    static const nw_elf_kernel kernel = {NW_ELF_ABI, kernel_call, no_error};
    nw_elf_module world = {0};
    char *args[] = {(char *)&kernel, (char *)&world};
    if (fw_nentries != 1 || fw_entries[0](2, args) || world.abi != NW_ELF_ABI) { puts("handshake failed"); return 1; }
    world.init();
    for (step = 0; step < (int)(sizeof script / sizeof *script); step++) {
        const struct script_event *e = &script[step];
        int result = world.event(e->kind, e->second, e->timer, e->token, e->type, e->json, (int)strlen(e->json), e->from);
        printf("[\"end\",%d]\n", result);
    }
    puts("transcript done");
    return 0;
}
