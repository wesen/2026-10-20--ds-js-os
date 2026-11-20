// Fixed catalog measurement entry in disposable firmware; no caller-selected code or path.
#include <stdio.h>
#include <unistd.h>
#include "freertos/FreeRTOS.h"
#include <stdlib.h>
#include <string.h>
#include "p4.h"
#include "quickjs.h"
#include "wasm_export.h"
#include "chess_fixtures.h"

extern bool lab_wamr_ready(char *, size_t);
static JSValue micros(JSContext *ctx, JSValueConst self, int argc, JSValueConst *argv) {
    return JS_NewInt64(ctx, port_clock());
}
static bool evaluate(JSContext *ctx, const char *name) {
    size_t size = 0;
    char *text = p4_bundle_read(name, &size, NULL, 0);
    if (!text) return false;
    JSValue v = JS_Eval(ctx, text, size, name, JS_EVAL_TYPE_GLOBAL);
    free(text);
    bool ok = !JS_IsException(v);
    JS_FreeValue(ctx, v);
    return ok;
}
static int interrupt(JSRuntime *rt, void *opaque) {
    return port_clock() > *(vtime_t *)opaque;
}
static void exception(JSContext *ctx) {
    JSValue v = JS_GetException(ctx);
    const char *s = JS_ToCString(ctx, v);
    printf("LAB ERROR js %.180s\n", s ? s : "unavailable");
    JS_FreeCString(ctx, s); JS_FreeValue(ctx, v);
}
static JSContext *realm(JSRuntime **rt, vtime_t *deadline) {
    *rt = JS_NewRuntime();
    if (!*rt) return NULL;
    JS_SetMaxStackSize(*rt, port_js_stack());
    JS_SetMemoryLimit(*rt, 6 * 1024 * 1024);
    JS_SetInterruptHandler(*rt, interrupt, deadline);
    return JS_NewContext(*rt);
}
static void js_trial(const char *name, const char *arm, int reps) {
    vtime_t deadline = port_clock() + 2400000;
    JSRuntime *rt; JSContext *ctx = realm(&rt, &deadline);
    if (!ctx) { if (rt) JS_FreeRuntime(rt); puts("LAB ERROR realm"); return; }
    JSValue g = JS_GetGlobalObject(ctx);
    JS_SetPropertyStr(ctx, g, "labMicros", JS_NewCFunction(ctx, micros, "labMicros", 0));
    char file[64]; snprintf(file, sizeof file, "study/%s.js", name);
    if (evaluate(ctx, file)) {
        JSValue fn=JS_GetPropertyStr(ctx, g, "renderLabRun");
        JSValue args[2] = {JS_NewString(ctx, arm),JS_NewInt32(ctx,reps)};
        JSValue v=JS_Call(ctx,fn,JS_UNDEFINED,2,args);
        if (JS_IsException(v)) exception(ctx);
        else {
            const char *result=JS_ToCString(ctx,v);
            printf("LAB JS %s %s %s\n", name, arm, result?result:"null");
            JS_FreeCString(ctx,result);
        }
        JS_FreeValue(ctx,v); JS_FreeValue(ctx,fn); JS_FreeValue(ctx,args[0]); JS_FreeValue(ctx,args[1]);
    } else exception(ctx);
    JS_FreeValue(ctx,g); JS_FreeContext(ctx); JS_FreeRuntime(rt);
}
static uint8_t *compile_view(const char *source, size_t length, size_t *out) {
    JSRuntime *rt; vtime_t deadline = port_clock()+2600000;
    JSContext *ctx = realm(&rt,&deadline);
    uint8_t *data=NULL;
    if (!ctx) { if (rt) JS_FreeRuntime(rt); return NULL; }
    if (evaluate(ctx,"typed/wasm.js")) {
        JSValue g=JS_GetGlobalObject(ctx), api=JS_GetPropertyStr(ctx,g,"typedWasm");
        JSValue fn=JS_GetPropertyStr(ctx,api,"compile"), input=JS_NewStringLen(ctx,source,length);
        JSValue v=JS_Call(ctx,fn,api,1,&input);
        if (JS_IsException(v)) exception(ctx);
        else {
            JSValue bytes=JS_GetPropertyStr(ctx,v,"bytes");
            size_t offset=0,n=0,element=0,cap=0;
            JSValue ab=JS_GetTypedArrayBuffer(ctx,bytes,&offset,&n,&element);
            uint8_t *raw=JS_GetArrayBuffer(ctx,&cap,ab);
            if (raw && offset<=cap && n<=cap-offset && n<=65536 && element==1) {
                data=malloc(n); if(data) { memcpy(data,raw+offset,n); *out=n; }
            }
            JS_FreeValue(ctx,ab); JS_FreeValue(ctx,bytes);
        }
        JS_FreeValue(ctx,v); JS_FreeValue(ctx,input); JS_FreeValue(ctx,fn); JS_FreeValue(ctx,api); JS_FreeValue(ctx,g);
    } else exception(ctx);
    JS_FreeContext(ctx); JS_FreeRuntime(rt);
    return data;
}
static uint8_t *read_fixture(const char *name,size_t len) {
    FILE *fp=fopen(name,"rb");
    if(!fp)return NULL;
    uint8_t *p=malloc(len+1);
    if(p && (fread(p,1,len+1,fp)!=len || ferror(fp))) {free(p);p=NULL;}
    fclose(fp);return p;
}
static bool first_only;
static void chess_trial(const char *arm, int reps) {
    size_t n=0,length=0,nsource=0;
    char error[128]="";
    uint8_t *expected=(uint8_t *)p4_bundle_read("study/view.wasm",&n,NULL,0);
    uint8_t *code=NULL;
    char *source=p4_bundle_read("study/view.typed",&nsource,NULL,0);
    wasm_module_t mod=NULL; wasm_module_inst_t instance=NULL; wasm_exec_env_t env=NULL;
    if(!expected || !source || !lab_wamr_ready(error,sizeof error)) goto done;
    vtime_t start=port_clock();
    if(!strcmp(arm,"resident")) {
        code=malloc(n); if(code)memcpy(code,expected,n); length=n;
    } else if(!strcmp(arm,"module")) {
        code=read_fixture("/files/rlab1120/view.wasm",n); length=n;
    } else if(!strcmp(arm,"source")) {
        uint8_t *edited=read_fixture("/files/rlab1120/view.typed",nsource);
        if(edited && !memcmp(edited,source,nsource)) code=compile_view((const char *)edited,nsource,&length);
        free(edited);
    }
    if(!code || length!=n || memcmp(expected,code,n)) {strcpy(error,"artifact differs or missing");goto done;}
    vtime_t acquired=port_clock();
    mod=wasm_runtime_load(code,n,error,sizeof error);
    if(!mod || wasm_runtime_get_import_count(mod)) goto done;
    InstantiationArgs args={.default_stack_size=16384,.host_managed_heap_size=0,.max_memory_pages=1};
    instance=wasm_runtime_instantiate_ex(mod,&args,error,sizeof error);
    if(!instance)goto done;
    env=wasm_runtime_create_exec_env(instance,16384);
    wasm_function_inst_t fn=wasm_runtime_lookup_function(instance,"render");
    if(!env || !fn || !wasm_runtime_validate_app_addr(instance,0,65536))goto done;
    uint8_t *mem=wasm_runtime_addr_app_to_native(instance,0);
    vtime_t installed=port_clock(),reset_us=0,guest_us=0,check_us=0;
    size_t checked=0;
    for(int r=0;r<reps;r++)for(size_t i=0;i<(first_only?1:sizeof chess_fixtures/sizeof *chess_fixtures);i++){
        const uint8_t *board=chess_fixtures[i].board;
        uint32_t in[4]={0,160,224,16616};
        vtime_t a=port_clock();
        memset(mem,0,65536);
        *(uint32_t *)(mem+0)=72;
        for(int j=0;j<72;j++)((uint16_t *)(mem+4))[j]=board[j];
        memcpy(mem+160,chess_fixtures[i].fields,36);
        *(uint32_t *)(mem+224)=8192; *(uint32_t *)(mem+16616)=120;
        wasm_runtime_set_instruction_count_limit(env,2000000);
        vtime_t b=port_clock();
        if(!wasm_runtime_call_wasm(env,fn,4,in)) {snprintf(error,sizeof error,"trap: %.90s",wasm_runtime_get_exception(instance));goto done;}
        vtime_t c=port_clock();
        uint32_t nt=in[0]/128, nh=in[0]%128, sum=2166136261u;
        if(nt!=chess_fixtures[i].tree_n || nh!=chess_fixtures[i].hint_n || nt>8192 || nh>120){strcpy(error,"length mismatch");goto done;}
        for(uint32_t j=0;j<nt;j++)sum=(sum^mem[228+j*2])*16777619u;
        for(uint32_t j=0;j<nh;j++)sum=(sum^mem[16620+j*2])*16777619u;
        if(sum!=chess_fixtures[i].fnv1a){strcpy(error,"fixture checksum");goto done;}
        checked++; reset_us+=b-a; guest_us+=c-b; check_us+=port_clock()-c;
    }
    printf("LAB VIEW %s {\"acquireUs\":%lld,\"installUs\":%lld,\"resetUs\":%lld,\"guestUs\":%lld,\"checkUs\":%lld,\"frames\":%u,\"moduleBytes\":%u}\n",arm,(long long)(acquired-start),(long long)(installed-acquired),(long long)reset_us,(long long)guest_us,(long long)check_us,(unsigned)checked,(unsigned)n);
done:
    if(*error || !env)printf("LAB ERROR view %.100s\n",*error?error:"setup");
    if(env)wasm_runtime_destroy_exec_env(env);
    if(instance)wasm_runtime_deinstantiate(instance);
    if(mod)wasm_runtime_unload(mod);
    free(code);free(expected);free(source);
}
typedef struct {vtime_t at, us; unsigned size; char role[18], event[20];} lab_sample;
static lab_sample tracebuf[192];
static size_t count, lost;
static bool active;
static portMUX_TYPE lablock=portMUX_INITIALIZER_UNLOCKED;
void lab_timing(const char *role, const char *event,vtime_t start,unsigned bytes) {
    if(!__atomic_load_n(&active,__ATOMIC_RELAXED))return;
    vtime_t end=port_clock();
    portENTER_CRITICAL(&lablock);
    if(active && count<192){
        lab_sample *s=&tracebuf[count++];s->at=start;s->us=end-start;s->size=bytes;
        snprintf(s->role,sizeof s->role,"%s",role);snprintf(s->event,sizeof s->event,"%s",event);
    }else if(active)lost++;
    portEXIT_CRITICAL(&lablock);
}
static void trace(const char *arm){
    portENTER_CRITICAL(&lablock);
    __atomic_store_n(&active,false,__ATOMIC_RELAXED);
    if(!strcmp(arm,"start")){count=lost=0;__atomic_store_n(&active,true,__ATOMIC_RELAXED);}
    portEXIT_CRITICAL(&lablock);
    if(!strcmp(arm,"stop")){
        for(size_t i=0;i<count;i++){lab_sample *s=&tracebuf[i];
            printf("LAB TRACE %lld %lld %u %s %s\n",(long long)s->at,(long long)s->us,s->size,s->role,s->event);}
        printf("LAB TRACE_END %u %u\n",(unsigned)count,(unsigned)lost);}
}
static void cleanup(void) {
    const char *names[]={"view.wasm","view.typed"};
    for(int i=0;i<2;i++) {
        char bundle[48], path[96];size_t n=0;
        snprintf(bundle,sizeof bundle,"study/%s",names[i]);
        snprintf(path,sizeof path,"/files/rlab1120/%s",names[i]);
        char *ref=p4_bundle_read(bundle,&n,NULL,0);uint8_t *file=ref?read_fixture(path,n):NULL;
        if(file && !memcmp(ref,file,n))unlink(path);
        free(ref);free(file);
    }
    rmdir("/files/rlab1120");
}
void render_lab(const char *rest) {
    char name[16]="",arm[32]="";int reps=1;
    if(sscanf(rest,"%15s %31s %d",name,arm,&reps)<2 || reps<1 || reps>64) {puts("LAB ERROR args");return;}
    if(!strcmp(name,"view"))chess_trial(arm,reps);
    else if(!strcmp(name,"snake") || !strcmp(name,"sysmon") || !strcmp(name,"reader") || !strcmp(name,"binary") || !strcmp(name,"chess"))js_trial(name,arm,reps);
    else if(!strcmp(name,"install")){first_only=true;chess_trial(arm,1);first_only=false;}
    else if(!strcmp(name,"trace"))trace(arm);
    else if(!strcmp(name,"cleanup") && !strcmp(arm,"fixtures"))cleanup();
    else if(!strcmp(name,"capture") && (!strcmp(arm,"editor") || !strcmp(arm,"chess") || !strcmp(arm,"snake") || !strcmp(arm,"sysmon"))) {
        world_t *w=world_by_name(arm);
        if(w && w->frame)printf("LAB FRAME %s %s\n",arm,w->frame);
    }
}
