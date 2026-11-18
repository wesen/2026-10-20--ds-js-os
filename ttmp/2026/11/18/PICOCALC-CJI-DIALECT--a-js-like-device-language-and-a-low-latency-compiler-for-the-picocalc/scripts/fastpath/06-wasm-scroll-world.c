/* Test-only world bridge. The compiler-generated scrollStart body is inserted
 * after linking, in place of the placeholder's exported function body.
 */
#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "nw.h"

int32_t scrollStart(int32_t sel, int32_t count, int32_t visible);

void nw_init(void)
{
    nw_kind("service");
    nw_log("typed scroll diagnostic initialized");
}

int nw_on_event(const nw_event *e)
{
    if (e->kind != NW_MESSAGE || !e->ask || strcmp(e->type, "scroll"))
        return NW_DONE;

    if (e->json[0] != '[') {
        nw_reject("expected three i32 values");
        return NW_DONE;
    }

    const char *next = e->json + 1;
    int32_t values[3];
    for (int i = 0; i < 3; i++) {
        char *end;
        errno = 0;
        long value = strtol(next, &end, 10);
        char delimiter = i == 2 ? ']' : ',';
        if (end == next || *end != delimiter || errno == ERANGE ||
            value < INT32_MIN || value > INT32_MAX || (i == 2 && end[1] != '\0')) {
            nw_reject("expected three i32 values");
            return NW_DONE;
        }
        values[i] = (int32_t)value;
        next = end + 1;
    }
    int32_t start = scrollStart(values[0], values[1], values[2]);
    char result[16];
    snprintf(result, sizeof result, "%d", (int)start);
    nw_reply(result);
    return NW_DONE;
}
