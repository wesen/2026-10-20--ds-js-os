#include <stdio.h>
#include <stdlib.h>
#include "mbedtls/sha256.h"
#include "p4.h"

extern __typeof__(p4_typed_compile) p4_typed_compile_profile;
void lab_files_probe(void);
static const p4_compile_limits limits = {.heap_bytes = 4*1024*1024, .duration_us = 6000000};

static char *compile_one(const char *lane, bool profile, size_t *len) {
    vtime_t start = port_clock();
    size_t src_len, reactor_len;
    char linker[64];
    snprintf(linker, sizeof(linker), "labs/%s/world.js", lane);
    char *src = p4_bundle_read("editor/editor.typed", &src_len, NULL, 0);
    char *reactor = p4_bundle_read("editor/reactor.bin", &reactor_len, NULL, 0);
    char *module = NULL;
    if (src && reactor) {
        __typeof__(&p4_typed_compile) run = profile ? p4_typed_compile_profile : p4_typed_compile;
        module = run(lane,"bundle",src,src_len,linker,"compileTypedWorldRv32",ENG_NATIVE,reactor,reactor_len,len,start,&limits);
    }
    free(src);
    free(reactor);
    return module;
}

static bool trial(unsigned block, unsigned position, const char *lane, bool profile) {
    size_t size = 0;
    char *module = compile_one(lane, profile, &size);
    unsigned char hash[32];
    bool ok = module && mbedtls_sha256((unsigned char *)module,size,hash,0) == 0;
    free(module);
    if (!ok) { printf("LABFAIL %u %u %s\n",block,position,lane); return false; }
    printf("LABSHA %u %u %s ",block,position,lane);
    for (unsigned i=0; i<32; ++i) printf("%02x",hash[i]);
    puts("");
    return true;
}

char *p4_editor_compile(size_t *length) {
    static bool ran;
    if (!ran) {
        ran = true;
        const char *lanes[] = {"base","branch","compact","direct"};
        const unsigned rows[][4] = {{0,1,3,2},{1,2,0,3},{2,3,1,0},{3,0,2,1}};
        for (unsigned b=0; b<4; ++b)
            for (unsigned p=0; p<4; ++p)
                if (!trial(b,p,lanes[rows[b][p]],false)) return NULL;
        const char *profile[] = {"pb","pd","pd","pb"};
        for (unsigned i=0; i<4; ++i)
            if (!trial(4+i/2,i%2,profile[i],true)) return NULL;
        lab_files_probe();
        puts("LABCOMPLETE");
    }
    return compile_one("branch",false,length);
}
