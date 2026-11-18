// Count calls from the compiled frontend. Linker wrapping preserves the runtime ABI.
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#define CAP 32768
struct site { uintptr_t pc; unsigned op; uint64_t calls; };
static struct site sites[CAP];
static void count(uintptr_t pc, unsigned op) {
    unsigned i = (pc >> 2) % CAP;
    for (unsigned tries = 0; tries < CAP; ++tries, i = (i+1) % CAP) {
        struct site *s = &sites[i];
        if (!s->pc) { s->pc = pc; s->op = op; }
        if (s->pc == pc && s->op == op) { ++s->calls; return; }
    }
    abort();
}
#define CALLER ((uintptr_t)__builtin_return_address(0)-1)
int64_t __real_rt_any_index(int64_t,int64_t,int64_t*);
int64_t __real_rt_any_eq(int64_t,int64_t);
int64_t __real_rt_any_get(int64_t,int64_t);
int64_t __wrap_rt_any_index(int64_t o,int64_t k,int64_t *r) {
    count(CALLER,0); return __real_rt_any_index(o,k,r);
}
int64_t __wrap_rt_any_get(int64_t o,int64_t k) {
    count(CALLER,1); return __real_rt_any_get(o,k);
}
int64_t __wrap_rt_any_eq(int64_t a,int64_t b) {
    count(CALLER,2); return __real_rt_any_eq(a,b);
}
__attribute__((destructor)) static void report(void) {
    for (unsigned i=0; i<CAP; ++i)
        if (sites[i].pc) fprintf(stderr,"SITE %lx %u %llu\n",(unsigned long)sites[i].pc,sites[i].op,(unsigned long long)sites[i].calls);
}
