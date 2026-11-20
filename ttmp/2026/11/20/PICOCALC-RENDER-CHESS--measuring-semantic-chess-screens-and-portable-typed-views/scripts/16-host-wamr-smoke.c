// Exercise the same producer harness against the project's host build of WAMR before spending a device slot.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include "wasm_export.h"
#include "nw_wire.h"
typedef int64_t vtime_t;
enum {NW_KIND=NW_CALL_KIND,NW_PRESENT=NW_CALL_PRESENT,NW_SCREEN=NW_CALL_SCREEN};
static vtime_t port_clock(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC,&t); return t.tv_sec*1000000LL + t.tv_nsec/1000; }
static bool lab_wamr_ready(char *error,size_t n);
#include "14-board-producer.inc"
static int64_t call(wasm_exec_env_t e,int32_t op,int32_t a,int32_t b,int64_t c,const char *p,uint32_t np,const char *q,uint32_t nq,const char *s,uint32_t ns,char *out,uint32_t no) {
    int64_t r;
    if(!lab_producer_intercept(e,op,p,np,q,nq,&r)) abort();
    return r;
}
static int bad(wasm_exec_env_t e,...) {abort();}
static bool lab_wamr_ready(char *error,size_t n) {
    static bool ready=false;
    static NativeSymbol services[]={{"call",call,"(iiiI*~*~*~*~)I",NULL},{"error",bad,"(*~)i",NULL}};
    static NativeSymbol wasi[]={{"fd_close",bad,"(i)i",NULL},{"fd_seek",bad,"(iIii)i",NULL},{"fd_write",bad,"(iiii)i",NULL}};
    if(!ready) ready=wasm_runtime_init() && wasm_runtime_register_natives("nw",services,2) && wasm_runtime_register_natives("wasi_snapshot_preview1",wasi,3);
    if(!ready) snprintf(error,n,"WAMR runtime setup");
    return ready;
}
int main(void) { producer_trial("generic",4);producer_trial("semantic",4);return 0; }
