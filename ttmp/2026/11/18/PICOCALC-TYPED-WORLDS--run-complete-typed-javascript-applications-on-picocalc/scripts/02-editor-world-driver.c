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
static int declarations, frames, reads, replies, released, yields;

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
    (void)b; (void)c; (void)n0; (void)n1; (void)s2; (void)n2; (void)out; (void)out_n;
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
        expect(frames < 3, "typed screen count");
        expect(!strcmp(s1, frames ? "F2 save F3 find F4 next F6 view Esc back" : "Esc Files"), "typed hints");
        puts(s0);
        frames++;
        return 0;
    case NW_CALL_FS_READ:
        expect(reads < 3 && a == 23 + reads && !*s0, "read the offered file");
        return 100 + reads++;
    case NW_CALL_REPLY:
        expect(!strcmp(s0, replies < 2 ? "{\"ok\":true}" : "{\"ok\":false,\"why\":\"permission denied\"}"),
               "report whether the file opened");
        replies++;
        return 0;
    case NW_CALL_RELEASE:
        expect(released < 2 && a == (released ? 25 : 23), "release the previous or refused file");
        released++;
        return 1;
    case NW_CALL_SLEEP:
        expect(a == 0 && yields < 32, "bounded open work");
        return 200 + yields++;
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
    const char *initial = "{\"file\":{\"$h\":23},\"name\":\"entry.txt\"}";
    const char *fresh = "{\"file\":{\"$h\":24},\"name\":\"fresh.txt\"}";
    const char *missing = "\"no file fresh.txt\"";
    expect(world.event(NW_MESSAGE, 1, 0, 0, "open", initial, strlen(initial), "files") == NW_LATER && reads == 1, "open waits");
    expect(world.event(NW_SETTLE, 1, 0, 99, "", "\"stale\"", 7, "") == NW_LATER && frames == 1, "ignore another token");
    int result = world.event(NW_SETTLE, 1, 0, 100, "", settled, strlen(settled), "");
    for (int i = 0; result == NW_LATER && i < 32; i++) {
        expect(yields == i + 1 && frames == 1 && replies == 0, "open stays pending during a slice");
        result = world.event(NW_SETTLE, 1, 0, 200 + i, "", "null", 4, "");
    }
    expect(result == NW_DONE && frames == 2 && replies == 1, "read settles and publishes");
    expect(world.event(NW_MESSAGE, 1, 0, 0, "open", fresh, strlen(fresh), "files") == NW_LATER && reads == 2, "open another file");
    expect(world.event(NW_SETTLE, 0, 0, 101, "", missing, strlen(missing), "") == NW_DONE &&
           frames == 3 && replies == 2 && released == 1, "missing file is empty and replaces the old grant");
    const char *bad = "{\"file\":{\"$h\":25},\"name\":\"bad.txt\"}";
    const char *denied = "\"permission denied\"";
    expect(world.event(NW_MESSAGE, 1, 0, 0, "open", bad, strlen(bad), "files") == NW_LATER && reads == 3, "open denied file");
    expect(world.event(NW_SETTLE, 0, 0, 102, "", denied, strlen(denied), "") == NW_DONE &&
           frames == 3 && replies == 3 && released == 2, "refusal preserves the previous document and grant");
    puts("Typed Editor startup, file read, missing file, and grant release passed");
    return 0;
}
