/* Ticket-only replacement for editor_p4.c in an isolated ESP-IDF build. */
#include <stdio.h>
#include <stdlib.h>
#include "mbedtls/sha256.h"
#include "p4.h"
#ifndef TRIAL_FIRST
#define TRIAL_FIRST "original"
#endif

static const p4_compile_limits limits = {.heap_bytes = 4 * 1024 * 1024, .duration_us = 6000000};

static char *compile_one(const char *lane, size_t *length) {
    vtime_t started = port_clock();
    size_t source_len = 0, reactor_len = 0;
    char *source = p4_bundle_read("editor/editor.typed", &source_len, NULL, 0);
    char *reactor = p4_bundle_read("editor/reactor.bin", &reactor_len, NULL, 0);
    char *module = NULL;
    if (source && reactor)
        module = p4_typed_compile(lane, "bundle", source, source_len, "typed/world.js",
                                  "compileTypedWorldRv32", ENG_NATIVE, reactor, reactor_len,
                                  length, started, &limits);
    free(reactor);
    free(source);
    return module;
}

char *p4_editor_compile(size_t *length) {
    // The loader may ask for Editor again. Run the balanced series only once per boot.
    static bool started_trials;
    if (!started_trials) {
        started_trials = true;
        const char *lanes[] = {TRIAL_FIRST, "register", "packed", "stream"};
        const unsigned orders[][4] = {{0,1,3,2}, {1,2,0,3}, {2,3,1,0}, {3,0,2,1}};
        for (unsigned block = 0; block < 4; ++block) {
            for (unsigned pos = 0; pos < 4; ++pos) {
                const char *lane = lanes[orders[block][pos]];
                size_t size = 0;
                char *module = compile_one(lane, &size);
                unsigned char hash[32];
                if (!module || mbedtls_sha256((unsigned char *)module, size, hash, 0) != 0) {
                    free(module);
                    printf("thesis failure %u %u %s\n", block, pos, lane);
                    return NULL;
                }
                free(module);
                printf("thesis digest %u %u %s ", block, pos, lane);
                for (unsigned i = 0; i < sizeof(hash); ++i) printf("%02x", hash[i]);
                printf("\n");
            }
        }
        puts("thesis trials complete");
    }
    return compile_one("editor", length);
}
