/* Evaluate compiler and test sources in the vendored runtime with the native index installed. */
#include "01-typed-lex-index.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

static JSValue read_path(JSContext *ctx, const char *path) {
    FILE *f = fopen(path, "rb");
    if (!f) return JS_ThrowInternalError(ctx, "cannot open %s", path);
    if (fseek(f, 0, SEEK_END)) { fclose(f); return JS_ThrowInternalError(ctx, "seek failed"); }
    long n = ftell(f);
    rewind(f);
    char *data = n >= 0 ? malloc((size_t)n + 1) : NULL;
    if (!data || fread(data, 1, (size_t)n, f) != (size_t)n) {
        fclose(f); free(data);
        return JS_ThrowInternalError(ctx, "read failed: %s", path);
    }
    fclose(f);
    JSValue text = JS_NewStringLen(ctx, data, (size_t)n);
    free(data);
    return text;
}
static JSValue read_source(JSContext *ctx, JSValueConst self, int argc, JSValueConst *argv) {
    if (argc != 1) return JS_ThrowTypeError(ctx, "expected path");
    const char *path = JS_ToCString(ctx, argv[0]);
    if (!path) return JS_EXCEPTION;
    JSValue result = read_path(ctx, path);
    JS_FreeCString(ctx, path);
    return result;
}
static JSValue print_line(JSContext *ctx, JSValueConst self, int argc, JSValueConst *argv) {
    for (int i=0; i<argc; i++) {
        const char *s=JS_ToCString(ctx,argv[i]);
        if (!s) return JS_EXCEPTION;
        if (i) fputc(' ',stdout);
        fputs(s,stdout);
        JS_FreeCString(ctx,s);
    }
    fputc('\n',stdout);
    return JS_UNDEFINED;
}
static JSValue cpu_ms(JSContext *ctx, JSValueConst self, int argc, JSValueConst *argv) {
    struct timespec t;
    clock_gettime(CLOCK_PROCESS_CPUTIME_ID,&t);
    return JS_NewFloat64(ctx, 1000.0*t.tv_sec + t.tv_nsec/1e6);
}
static int load(JSContext *ctx, const char *path) {
    JSValue input = read_path(ctx, path);
    if (JS_IsException(input)) return 0;
    size_t n;
    const char *data = JS_ToCStringLen(ctx,&n,input);
    JSValue result = data ? JS_Eval(ctx,data,n,path,JS_EVAL_TYPE_GLOBAL) : JS_EXCEPTION;
    if (data) JS_FreeCString(ctx,data);
    JS_FreeValue(ctx,input);
    int ok = !JS_IsException(result);
    JS_FreeValue(ctx,result);
    return ok;
}
int main(int argc, char **argv) {
    if (argc < 3) { fprintf(stderr,"usage: %s REFERENCE|INDEX FILE... -- ARG...\n",argv[0]); return 2; }
    JSRuntime *rt=JS_NewRuntime();
    JS_SetMemoryLimit(rt,4*1024*1024);
    JSContext *ctx=JS_NewContext(rt);
    JSValue g=JS_GetGlobalObject(ctx);
    int ok=!strcmp(argv[1],"REFERENCE") || (!strcmp(argv[1],"INDEX") && typed_lex_index_install(ctx));
    JS_SetPropertyStr(ctx,g,"readText",JS_NewCFunction(ctx,read_source,"readText",1));
    JS_SetPropertyStr(ctx,g,"print",JS_NewCFunction(ctx,print_line,"print",1));
    JS_SetPropertyStr(ctx,g,"cpuMs",JS_NewCFunction(ctx,cpu_ms,"cpuMs",0));
    int end=2;
    while (end<argc && strcmp(argv[end],"--")) end++;
    JSValue args=JS_NewArray(ctx);
    for (int i=end+1;i<argc;i++) JS_SetPropertyUint32(ctx,args,i-end-1,JS_NewString(ctx,argv[i]));
    JS_SetPropertyStr(ctx,g,"scriptArgs",args);
    for (int i=2;ok && i<end;i++) ok=load(ctx,argv[i]);
    if (!ok) {
        JSValue exc=JS_GetException(ctx);
        JSValue stack=JS_GetPropertyStr(ctx,exc,"stack");
        const char *name=JS_ToCString(ctx,exc), *trace=JS_ToCString(ctx,stack);
        fprintf(stderr,"%s\n%s\n",name?name:"exception",trace?trace:"");
        JS_FreeCString(ctx,name);JS_FreeCString(ctx,trace);
        JS_FreeValue(ctx,stack);JS_FreeValue(ctx,exc);
    }
    JS_FreeValue(ctx,g); JS_FreeContext(ctx); JS_FreeRuntime(rt);
    return ok?0:1;
}
