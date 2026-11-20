#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "nw.h"
#include "nw_elf.h"
#include "nw_wire.h"

static const struct edit_event {
    int kind, second, token, fail_yield;
    const char *label, *type, *json, *from;
} events[];
#include "editor-events.h"

int (*fw_entries[16])(int, char **);
uint32_t fw_sizes[16];
int fw_nentries;
extern int64_t __divdi3(int64_t, int64_t);
const struct { const char *name; const void *address; } fw_resolve[] = {
    {"strlen", strlen}, {"memcpy", memcpy}, {"memset", memset}, {"memmove", memmove},
    {"snprintf", snprintf}, {"__divdi3", __divdi3},
};
const int fw_nresolve = sizeof fw_resolve / sizeof *fw_resolve;
static int timer = 2000;
static int fail_yield;

static int no_error(char *out, size_t n) { if (n) *out = 0; return 0; }

static int64_t system_call(int op, int a, int b, int64_t c, const char *s0, size_t n0,
                           const char *s1, size_t n1, const char *s2, size_t n2, char *out, size_t out_n)
{
    (void)b; (void)c; (void)n0; (void)s2; (void)n2;
    switch (op) {
    case NW_CALL_KIND:
    case NW_CALL_PRESENT:
        return 0;
    case NW_CALL_FS_READ:
        printf("read %d\n", a);
        return a == 29 ? -1 : 100 + a;
    case NW_CALL_FS_WRITE:
        if (n1 != sizeof expected_write - 1 || memcmp(s1, expected_write, n1)) {
            puts("unexpected snapshot bytes");
            exit(1);
        }
        printf("write %d %d\n", a, (int)n1);
        return 300 + a;
    case NW_CALL_SLEEP:
        if (a != 0) exit(1);
        if (fail_yield) {
            puts("sleep failed");
            return -1;
        }
        printf("sleep %d\n", ++timer);
        return timer;
    case NW_CALL_REPLY:
        printf("reply %s\n", s0);
        return 0;
    case NW_CALL_RELEASE:
        printf("release %d\n", a);
        return 1;
    case NW_CALL_SCREEN:
        printf("screen %s\nhints %s\n", s0, s1);
        return 0;
    case NW_CALL_STORE_LOAD:
        if (out_n) *out = 0;
        return 0;
    case NW_CALL_STORE_SAVE:
        printf("store %s\n", s0);
        return 0;
    case NW_CALL_CLOCK_WALL:
        return INT64_C(1792662060000);
    default:
        printf("unexpected system call %d\n", op);
        exit(1);
    }
}

int main(void)
{
    static const nw_elf_kernel kernel = {NW_ELF_ABI, system_call, no_error};
    nw_elf_module world = {0};
    char *args[] = {(char *)&kernel, (char *)&world};
    if (fw_nentries != 1 || fw_entries[0](2, args) || world.abi != NW_ELF_ABI) return 1;
    world.init();
    for (unsigned i = 0; i < sizeof events / sizeof *events; i++) {
        const struct edit_event *event = &events[i];
        fail_yield = event->fail_yield;
        printf("event %s\n", event->label);
        int result = world.event(event->kind, event->second, 0, event->token,
                                 event->type, event->json, strlen(event->json), event->from);
        printf("return %d\n", result);
    }
    return 0;
}
