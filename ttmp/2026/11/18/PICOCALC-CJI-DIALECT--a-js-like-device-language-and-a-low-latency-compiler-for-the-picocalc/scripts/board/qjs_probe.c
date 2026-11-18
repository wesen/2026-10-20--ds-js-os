// Diagnostic entry relinked in place of the console's existing "bench" callback.
// One fresh writer and reader per command. All OS calls except seed and identity are denied.
#include "quickjs.h"
#include "esp_timer.h"
#include "mbedtls/sha256.h"
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

char *port_read_file(const char *path, size_t *len);
size_t port_js_stack(void);
struct sample { const char *name, *path; unsigned kib; };
static const struct sample cases[] = {
#include "probe_manifest.inc"
};
static const char *world_name;
static unsigned cursor;

static JSValue host_stub(JSContext *ctx, JSValueConst self, int argc, JSValueConst *argv) {
    (void)self;
    const char *op = argc ? JS_ToCString(ctx, argv[0]) : NULL;
    JSValue r;
    if (op && !strcmp(op, "seed")) r = JS_NewInt32(ctx, 1);
    else if (op && !strcmp(op, "self")) r = JS_NewString(ctx, world_name);
    else r = JS_ThrowTypeError(ctx, "probe has no host operation %s", op ? op : "?");
    if (op) JS_FreeCString(ctx, op);
    return r;
}
static int done(JSContext *ctx, JSValue v, const char *phase) {
    if (!JS_IsException(v)) { JS_FreeValue(ctx, v); return 1; }
    JSValue err = JS_GetException(ctx);
    const char *s = JS_ToCString(ctx, err);
    printf("DIALECT_ERROR world=%s phase=%s msg=%.120s\n",world_name,phase,s ? s : "(exception)");
    if (s) JS_FreeCString(ctx,s);
    JS_FreeValue(ctx,err);
    return 0;
}
static void close_realm(JSRuntime *rt, JSContext *ctx) {
    if (ctx) JS_FreeContext(ctx);
    if (rt) JS_FreeRuntime(rt);
}
static JSContext *realm(JSRuntime **rt, unsigned kib) {
    *rt = JS_NewRuntime();
    if (!*rt) return NULL;
    JS_SetMemoryLimit(*rt, (size_t)kib * 1024);
    JS_SetMaxStackSize(*rt, port_js_stack());
    return JS_NewContext(*rt);
}
static int install_stubs(JSContext *ctx) {
    JSValue g = JS_GetGlobalObject(ctx);
    int k = JS_SetPropertyStr(ctx,g,"__k",JS_NewCFunction(ctx,host_stub,"__k",1));
    int ka = JS_SetPropertyStr(ctx,g,"__ka",JS_NewCFunction(ctx,host_stub,"__ka",1));
    JS_FreeValue(ctx,g);
    return k >= 0 && ka >= 0;
}
static const char *behavior(const char *name) {
    if (!strcmp(name,"agenda")) return "agExpand('dentist @tomorrow 2pm !15m',{y:2026,m:11,d:18}) === 'dentist @2026-11-19 14:00 !15m'";
    if (!strcmp(name,"files")) return "fiSize(1536) === '1.5 KB'";
    if (!strcmp(name,"flaky")) return "__dispatch(0,'ping','null','probe',true) === JSON.stringify('pong 1')";
    return NULL;
}
static void hash(const void *data, size_t n, char out[65]) {
    unsigned char bytes[32];
    mbedtls_sha256((const unsigned char *)data,n,bytes,0);
    for (unsigned i=0; i<32; ++i) snprintf(out+2*i,3,"%02x",bytes[i]);
}
void __wrap_vm_calibrate(void) {
    const unsigned count = sizeof(cases) / sizeof(cases[0]);
    unsigned ordinal = cursor++;
    const struct sample *w = &cases[ordinal % count];
    world_name = w->name;
    size_t len = 0, pn = 0, bytes = 0;
    char *source = port_read_file(w->path,&len);
    char *prelude = port_read_file("prelude.js",&pn);
    char sh[65] = "", bh[65] = "";
    uint8_t *artifact = NULL;
    JSRuntime *rt = NULL;
    JSContext *ctx = NULL;
    long long compile=-1, write=-1, read=-1, init=-1, pre=-1, check=-1, ready=-1;
    int ok=0, witness=-1;
    if (!source || !prelude) goto end;
    hash(source,len,sh);
    const int64_t start=esp_timer_get_time();
    ctx=realm(&rt,w->kib);
    if (!ctx) goto end;
    int64_t t=esp_timer_get_time();
    JSValue fun=JS_Eval(ctx,source,len,w->path,JS_EVAL_TYPE_GLOBAL|JS_EVAL_FLAG_COMPILE_ONLY);
    compile=esp_timer_get_time()-t;
    if (JS_IsException(fun)) { done(ctx,fun,"compile"); goto end; }
    t=esp_timer_get_time();
    uint8_t *encoded=JS_WriteObject(ctx,&bytes,fun,JS_WRITE_OBJ_BYTECODE);
    write=esp_timer_get_time()-t;
    JS_FreeValue(ctx,fun);
    if (!encoded) { done(ctx,JS_EXCEPTION,"encode"); goto end; }
    artifact=malloc(bytes);
    if (artifact) memcpy(artifact,encoded,bytes);
    js_free(ctx,encoded);
    close_realm(rt,ctx); rt=NULL; ctx=NULL;
    if (!artifact) goto end;
    ctx=realm(&rt,w->kib);
    if (!ctx || !install_stubs(ctx)) goto end;
    t=esp_timer_get_time();
    if (!done(ctx,JS_Eval(ctx,prelude,pn,"prelude.js",JS_EVAL_TYPE_GLOBAL),"prelude")) goto end;
    pre=esp_timer_get_time()-t;
    t=esp_timer_get_time();
    fun=JS_ReadObject(ctx,artifact,bytes,JS_READ_OBJ_BYTECODE);
    read=esp_timer_get_time()-t;
    if (JS_IsException(fun)) { done(ctx,fun,"read"); goto end; }
    t=esp_timer_get_time();
    if (!done(ctx,JS_EvalFunction(ctx,fun),"register")) goto end;
    const char *meta="__init().kind";
    JSValue kind=JS_Eval(ctx,meta,strlen(meta),"probe-meta",JS_EVAL_TYPE_GLOBAL);
    if (JS_IsException(kind)) { done(ctx,kind,"init"); goto end; }
    int defined=JS_IsString(kind);
    JS_FreeValue(ctx,kind);
    if (!defined) goto end;
    init=esp_timer_get_time()-t;
    ready=esp_timer_get_time()-start;
    const char *test=behavior(w->name);
    if (test) {
        t=esp_timer_get_time();
        JSValue result=JS_Eval(ctx,test,strlen(test),"probe-behavior",JS_EVAL_TYPE_GLOBAL);
        if (JS_IsException(result)) { done(ctx,result,"behavior"); goto end; }
        witness=JS_ToBool(ctx,result);
        JS_FreeValue(ctx,result);
        check=esp_timer_get_time()-t;
        if (witness!=1) goto end;
    }
    ok=1;
end:
    if (artifact) hash(artifact,bytes,bh);
    printf("DIALECT_QJS world=%s trial=%u ok=%d source=%s size=%u bytecode=%s bytes=%u compile_us=%lld write_us=%lld read_us=%lld prelude_us=%lld init_us=%lld ready_us=%lld check_us=%lld witness=%d kib=%u\n",w->name,ordinal/count,ok,sh,(unsigned)len,bh,(unsigned)bytes,compile,write,read,pre,init,ready,check,witness,w->kib);
    close_realm(rt,ctx); free(artifact); free(prelude); free(source);
}
