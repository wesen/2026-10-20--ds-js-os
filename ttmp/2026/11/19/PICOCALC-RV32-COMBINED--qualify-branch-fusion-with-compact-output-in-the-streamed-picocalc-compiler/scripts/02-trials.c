#include <stdio.h>
#include <stdlib.h>
#include "mbedtls/sha256.h"
#include "p4.h"

char *joint_editor_compile(size_t *length);
char *joint_agenda_compile(size_t *length);
const char *joint_backend = "lab/3.js"; /* Normal native worlds use both. */
static const char *const names[] = {"base","branch","compact","both"};
static const char *const paths[] = {"lab/0.js","lab/1.js","lab/2.js","lab/3.js"};

static bool measure(unsigned block, unsigned pos, unsigned lane, const char *app,
                    char *(*compile_app)(size_t *)) {
    printf("JOINT begin %u %u %s %s\n", block, pos, names[lane], app);
    size_t size = 0;
    char *module = compile_app(&size);
    unsigned char hash[32];
    if (!module || mbedtls_sha256((const unsigned char *)module,size,hash,0)) {
        free(module);
        printf("JOINT failed %s %s\n",app,names[lane]);
        return false;
    }
    free(module);
    printf("JOINT end %s %s ",names[lane],app);
    for (unsigned i=0; i<32; ++i) printf("%02x",hash[i]);
    puts("");
    return true;
}

char *p4_editor_compile(size_t *length) {
    static bool ran;
    if (!ran) {
        ran=true;
        const unsigned order[][4]={{0,1,3,2},{1,2,0,3},{2,3,1,0},{3,0,2,1}};
        for (unsigned b=0; b<4; ++b) {
            for (unsigned p=0; p<4; ++p) {
                unsigned lane=order[b][p];
                joint_backend=paths[lane];
                if (!measure(b,p,lane,"files",p4_files_compile) ||
                    !measure(b,p,lane,"agenda",joint_agenda_compile) ||
                    !measure(b,p,lane,"editor",joint_editor_compile)) {
                    joint_backend=paths[3];
                    return NULL;
                }
            }
        }
        joint_backend=paths[3];
        puts("JOINT complete");
    }
    return joint_editor_compile(length);
}
