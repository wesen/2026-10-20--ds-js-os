// A fresh 64-bit host QuickJS runtime loads the same capsule before each arm.
// Keep malloc accounting consistent with QuickJS on Linux and report the largest
// live usable-byte charge plus eight bytes overhead, including the validation hash.
#include "quickjs.h"
#include <malloc.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
typedef struct {size_t used, peak;} Meter;
static size_t usable(const void *p){return malloc_usable_size((void *)p);}
static void note(JSMallocState *s){Meter *m=s->opaque;m->used=s->malloc_size;if(m->used>m->peak)m->peak=m->used;}
static void *am(JSMallocState *s,size_t n){if(!n||s->malloc_size+n>s->malloc_limit)return NULL;void *p=malloc(n);if(p){s->malloc_count++;s->malloc_size+=usable(p)+8;note(s);}return p;}
static void af(JSMallocState *s,void *p){if(p){s->malloc_count--;s->malloc_size-=usable(p)+8;free(p);note(s);}}
static void *ar(JSMallocState *s,void *p,size_t n){if(!p)return am(s,n);if(!n){af(s,p);return NULL;}size_t old=usable(p);if(s->malloc_size+n-old>s->malloc_limit)return NULL;void *q=realloc(p,n);if(q){s->malloc_size+=usable(q)-old;note(s);}return q;}
static JSValue micros(JSContext *c,JSValueConst self,int argc,JSValueConst *argv){struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return JS_NewFloat64(c,t.tv_sec*1e6+t.tv_nsec/1e3);}
static JSValue eval(JSContext *c,const char *s,size_t n,int flags){
    JSValue v=JS_Eval(c,s,n,"render.js",flags);
    if(JS_IsException(v)){JSValue err=JS_GetException(c);const char *msg=JS_ToCString(c,err);fprintf(stderr,"%s\n",msg);exit(2);}return v;
}
int main(int argc,char **argv){
    if(argc!=3)return 1;
    FILE *f=fopen(argv[1],"rb");if(!f)return 1;fseek(f,0,SEEK_END);size_t n=ftell(f);rewind(f);
    char *s=calloc(n+1,1);if(!s||fread(s,1,n,f)!=n)return 1;fclose(f);
    Meter m={0};JSMallocFunctions alloc={am,af,ar,usable};JSRuntime *rt=JS_NewRuntime2(&alloc,&m);JSContext *ctx=JS_NewContext(rt);
    JSValue comp=eval(ctx,s,n,JS_EVAL_TYPE_GLOBAL|JS_EVAL_FLAG_COMPILE_ONLY);
    size_t bc;uint8_t *buf=JS_WriteObject(ctx,&bc,comp,JS_WRITE_OBJ_BYTECODE);if(!buf)return 2;js_free(ctx,buf);
    if(!strcmp(argv[2],"compile"))printf("{\"source\":%zu,\"bytecode\":%zu}",n,bc);
    else{
      JSValue g=JS_GetGlobalObject(ctx);JS_SetPropertyStr(ctx,g,"labMicros",JS_NewCFunction(ctx,micros,"labMicros",0));JS_FreeValue(ctx,g);
      JSValue r=JS_EvalFunction(ctx,JS_DupValue(ctx,comp));if(JS_IsException(r)){fprintf(stderr,"capsule init error\n");return 2;}JS_FreeValue(ctx,r);
      JS_RunGC(rt);size_t start=m.used;m.peak=start;
      char call[64];snprintf(call,sizeof(call),"renderLabRun('%s',1)",argv[2]);
      r=eval(ctx,call,strlen(call),JS_EVAL_TYPE_GLOBAL);const char *v=JS_ToCString(ctx,r);
      printf("{\"resident\":%zu,\"peak\":%zu,\"highWaterAboveStart\":%zu,\"result\":%s}",start,m.peak,m.peak-start,v);
      JS_FreeCString(ctx,v);JS_FreeValue(ctx,r);
    }
    JS_FreeValue(ctx,comp);JS_FreeContext(ctx);JS_FreeRuntime(rt);free(s);return 0;
}
