#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "nw.h"
#include "nw_elf.h"
#include "nw_wire.h"

int (*fw_entries[16])(int, char **);
uint32_t fw_sizes[16];
int fw_nentries;

static char frame[4096];
static int request;

char *strcat(char *dst, const char *src)
{
    strcpy(dst + strlen(dst), src);
    return dst;
}

static char *last_char(const char *str, int ch)
{
    const char *last = NULL;
    do { if (*str == (char)ch) last = str; } while (*str++);
    return (char *)last;
}

#define FLOAT_IMPORTS(X) X(__floatsidf) X(__ltdf2) X(__adddf3) X(__divdf3) X(__muldf3) X(__gedf2) \
    X(__fixunsdfsi) X(__fixunsdfdi) X(__udivdi3) X(__umoddi3)
#define DECLARE(name) extern char name[];
FLOAT_IMPORTS(DECLARE)
#undef DECLARE
const struct { const char *name; const void *address; } fw_resolve[] = {
#define IMPORT(name) {#name, name},
    IMPORT(strcpy) IMPORT(snprintf) IMPORT(qsort) IMPORT(memcpy) IMPORT(strcat) IMPORT(strncmp)
    IMPORT(memset) IMPORT(strcmp) IMPORT(strlen)
    FLOAT_IMPORTS(IMPORT)
    {"strrchr", last_char},
#undef IMPORT
};
const int fw_nresolve = sizeof fw_resolve / sizeof fw_resolve[0];

static void expect(int ok, const char *what)
{
    if (!ok) { printf("failed: %s\n", what); exit(1); }
}

static int64_t kernel_call(int op, int a, int b, int64_t c, const char *s0, size_t n0,
                           const char *s1, size_t n1, const char *s2, size_t n2,
                           char *out, size_t out_n)
{
    (void)b; (void)c; (void)n0; (void)n1; (void)s2; (void)n2; (void)out; (void)out_n;
    switch (op) {
    case NW_CALL_KIND: return 0;
    case NW_CALL_PRESENT: return 0;
    case NW_CALL_FS_OPEN: expect(!strcmp(s0, "fs:/"), "Files opens its root claim"); return 23;
    case NW_CALL_SCREEN: snprintf(frame, sizeof frame, "%s", s0); return 0;
    case NW_CALL_FS_OP: {
        static const char *const verbs[] = {"list", "info", "mkdir", "list", "info"};
        expect(request < 5 && a == 23 && !strcmp(s0, verbs[request]), "filesystem RPC");
        expect(!strcmp(s1, request == 2 ? "a" : ""), "relative filesystem pathname");
        return ++request;
    }
    default: expect(0, "unexpected SDK operation"); return -1;
    }
}

static int no_error(char *out, size_t n)
{
    if (n) *out = 0;
    return 0;
}

static int event(nw_elf_module *world, int kind, int token, const char *payload)
{
    return world->event(kind, 1, 0, token, "", payload, (int)strlen(payload), "");
}

static int key(nw_elf_module *world, const char *name, const char *ch)
{
    char payload[80];
    snprintf(payload, sizeof payload, "{\"key\":\"%s\",\"ch\":\"%s\",\"state\":\"down\"}", name, ch);
    return world->event(NW_MESSAGE, 0, 0, 0, "key", payload, (int)strlen(payload), "compositor");
}

int main(void)
{
    static const nw_elf_kernel kernel = {NW_ELF_ABI, kernel_call, no_error};
    nw_elf_module world = {0};
    char *args[] = {(char *)&kernel, (char *)&world};
    expect(fw_nentries == 1 && !fw_entries[0](2, args) && world.abi == NW_ELF_ABI, "ELF module handshake");
    world.init();
    expect(event(&world, NW_START, 0, "null") == NW_LATER, "start waits for listing");
    expect(event(&world, NW_SETTLE, 1, "[{\"name\":\"A.txt\",\"size\":1280,\"dir\":false},"
           "{\"name\":\"z\",\"size\":0,\"dir\":true}]") == NW_LATER, "list waits for storage info");
    expect(event(&world, NW_SETTLE, 2, "{\"free\":512}") == NW_DONE, "publish settled frame");
    const char *folder = strstr(frame, "\"label\":\"z/\""), *file = strstr(frame, "\"label\":\"A.txt\"");
    expect(folder && file && folder < file && strstr(file, "1.3 KB"), "compiled sort and size formatting");
    expect(key(&world, "f3", "") == NW_DONE && strstr(frame, "New folder"), "start mkdir");
    expect(key(&world, "a", "a") == NW_DONE && key(&world, "enter", "") == NW_LATER, "accept typed name");
    expect(event(&world, NW_SETTLE, 3, "null") == NW_LATER, "mkdir refreshes its parent");
    expect(event(&world, NW_SETTLE, 4, "[{\"name\":\"a\",\"size\":0,\"dir\":true}]") == NW_LATER, "new listing");
    expect(event(&world, NW_SETTLE, 5, "{\"free\":512}") == NW_DONE && strstr(frame, "\"label\":\"a/\""), "new folder visible");
    puts("Files RV32 startup, directory sorting, rounding, and mkdir passed");
    return 0;
}
