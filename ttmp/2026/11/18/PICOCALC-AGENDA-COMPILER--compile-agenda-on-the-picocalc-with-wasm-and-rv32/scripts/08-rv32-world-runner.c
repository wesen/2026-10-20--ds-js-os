#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "nw.h"
#include "nw_elf.h"
#include "nw_wire.h"

int (*fw_entries[16])(int, char **);
uint32_t fw_sizes[16];
int fw_nentries;

static char saved[16385];
static int frames, notifications, reads, offsets;
static int64_t wall = 1793733299000LL;
static int writes;
static int navigation;

static void expect(int ok, const char *where)
{
    if (!ok) {
        printf("failed: %s\n", where);
        exit(1);
    }
}

char *strcat(char *dst, const char *src)
{
    strcpy(dst + strlen(dst), src);
    return dst;
}

/* The emulator resolves ELF imports by reading this table from the driver. */
const struct {
    const char *name;
    void (*address)(void);
} fw_resolve[] = {
#define IMPORT(name) {#name, (void (*)(void))name}
    IMPORT(free), IMPORT(malloc), IMPORT(memcpy), IMPORT(memset),
    IMPORT(snprintf), IMPORT(strcat), IMPORT(strchr), IMPORT(strcmp),
    IMPORT(strlen), IMPORT(strncmp), IMPORT(strtoll), IMPORT(strstr), IMPORT(strcpy), IMPORT(qsort),
#undef IMPORT
};
const int fw_nresolve = sizeof fw_resolve / sizeof fw_resolve[0];

static int64_t kernel_call(int op, int a, int b, int64_t c, const char *s0, size_t n0,
                           const char *s1, size_t n1, const char *s2, size_t n2,
                           char *out, size_t out_n)
{
    (void)b; (void)n0; (void)n1; (void)n2;
    switch (op) {
    case NW_CALL_KIND: expect(!strcmp(s0, "app"), "declare app"); return 0;
    case NW_CALL_PRESENT: return 0;
    case NW_CALL_FS_OPEN: expect(!strcmp(s0, "fs:/notes"), "claim"); return 23;
    case NW_CALL_EVERY: expect(a == 15000, "timer cadence"); return 0;
    case NW_CALL_FS_READ:
        expect(a == 23 && !strcmp(s0, "todo.txt"), "file request");
        return ++reads;
    case NW_CALL_FS_WRITE:
        expect(a == 23 && !strcmp(s0, "todo.txt"), "write through notes claim");
        expect(!strcmp(s1, "- [ ] dentist @2026-11-03 14:30 !15m\n- [x] completed\n- book a train\n"
                           "- [ ] call clinic @2026-11-04 14:00 !15m\n"), "normalized saved entry");
        writes++;
        return 100;
    case NW_CALL_CLOCK_WALL: return wall;
    case NW_CALL_CLOCK_TODAY: return 20261101;
    case NW_CALL_CLOCK_ZONE: return snprintf(out, out_n, "EST5EDT,M3.2.0/2,M11.1.0/2");
    case NW_CALL_CLOCK_OFFSET:
        expect(c == 1793716200000LL || c == 1793800800000LL, "nominal civil epoch");
        offsets++;
        return 1440 - 300;
    case NW_CALL_STORE_LOAD:
        expect(out && out_n > strlen(saved), "load buffer");
        strcpy(out, saved);
        return strlen(saved);
    case NW_CALL_STORE_SAVE:
        expect(strstr(s0, "1793733300000|dentist") != NULL, "saved identity");
        expect(strlen(s0) < sizeof saved, "store capacity");
        strcpy(saved, s0);
        return 0;
    case NW_CALL_SCREEN:
        if (strstr(s0, "New:")) return 0;
        if (navigation) {
            const char *order[] = {"\"sel\":3", "\"sel\":3", "\"sel\":5", "\"sel\":3", "\"sel\":1", "\"sel\":1"};
            expect(strstr(s0, order[navigation - 1]) != NULL, "selection skips group headers");
            expect((strstr(s0, "\"label\":\"DONE\"") != NULL) == (navigation >= 2 && navigation <= 5),
                   "F4 shows completed tasks");
            navigation++;
            return 0;
        }
        expect(strstr(s0, "dentist") && strstr(s0, "book a train") && !strstr(s0, "completed"),
               "compiled task frame");
        frames++;
        return 0;
    case NW_CALL_SEND:
        expect(!strcmp(s0, "compositor") && !strcmp(s1, "notify"), "reminder destination");
        expect(!strcmp(s2, "{\"text\":\"dentist at 14:30\",\"sub\":\"in 15m\"}"), "reminder payload");
        notifications++;
        return 0;
    default: expect(0, "unexpected SDK operation"); return -1;
    }
}

static int no_error(char *out, size_t n)
{
    if (n) *out = 0;
    return 0;
}

static void event(nw_elf_module *world, int kind, int ok, int token, const char *payload)
{
    expect(world->event(kind, ok, 0, token, "", payload, (int)strlen(payload), "") == NW_DONE,
           "world event result");
}

static void key(nw_elf_module *world, const char *key_name, const char *ch)
{
    char payload[80];
    snprintf(payload, sizeof payload, "{\"key\":\"%s\",\"ch\":\"%s\",\"state\":\"down\"}", key_name, ch);
    expect(world->event(NW_MESSAGE, 0, 0, 0, "key", payload, (int)strlen(payload), "compositor") == NW_DONE,
           "key dispatch");
}

int main(void)
{
    static const nw_elf_kernel kernel = {NW_ELF_ABI, kernel_call, no_error};
    const char *file = "\"- [ ] dentist @2026-11-03 14:30 !15m\\n- [x] completed\\n- book a train\\n\"";
    expect(fw_nentries == 2, "two separately relocated instances");
    for (int i = 0; i < fw_nentries; i++) {
        nw_elf_module world = {0};
        char *args[] = {(char *)&kernel, (char *)&world};
        expect(!fw_entries[i](2, args) && world.abi == NW_ELF_ABI, "ELF module ABI");
        world.init();
        event(&world, NW_START, 0, 0, "null");
        event(&world, NW_SETTLE, 1, reads, file);
        if (i == 0) {
            expect(notifications == 0, "before due");
            wall = 1793733314000LL;
            event(&world, NW_TICK, 0, 0, "null");
            event(&world, NW_SETTLE, 1, reads, file);
        } else {
            key(&world, "f2", "");
            for (const char *p = "call clinic @wed 2pm !15m"; *p; p++) {
                char ch[] = {*p, 0};
                key(&world, ch, ch);
            }
            key(&world, "enter", "");
            event(&world, NW_SETTLE, 1, reads, file);
            expect(writes == 1, "user task write");
            event(&world, NW_SETTLE, 1, 100, "{}");
            event(&world, NW_SETTLE, 1, reads,
                  "\"- [ ] dentist @2026-11-03 14:30 !15m\\n- [x] completed\\n- book a train\\n"
                  "- [ ] call clinic @2026-11-04 14:00 !15m\\n\"");
        }
    }
    expect(reads == 5 && frames == 4 && offsets == 5 && notifications == 1, "restart and reminder");
    // Reopen the first reactor without another file read. Its dated/open/no-date
    // layout is still the original two open tasks and one hidden done task.
    nw_elf_module first = {0};
    char *args[] = {(char *)&kernel, (char *)&first};
    expect(!fw_entries[0](2, args), "re-enter first ELF instance");
    navigation = 1;
    key(&first, "down", "");
    key(&first, "f4", "");
    key(&first, "down", "");
    key(&first, "up", "");
    key(&first, "up", "");
    key(&first, "f4", "");
    expect(navigation == 7, "all navigation frames");
    printf("frames=%d reminders=%d writes=%d durable_restart=pass grouped_navigation=pass\n", frames, notifications, writes);
    return 0;
}
