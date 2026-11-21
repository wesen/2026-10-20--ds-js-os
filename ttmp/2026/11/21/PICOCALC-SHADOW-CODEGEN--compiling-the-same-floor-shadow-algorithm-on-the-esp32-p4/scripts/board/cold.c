#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include "quickjs.h"
#include "esp_heap_caps.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"
#include "cold_inputs.h"

typedef struct { size_t live,peak; } meter;
static size_t usable(const void *p){return p?heap_caps_get_allocated_size((void*)p):0;}
static void update(JSMallocState *s,size_t old,size_t next){
    meter *m=s->opaque;m->live=m->live-old+next;if(m->live>m->peak)m->peak=m->live;
}
static void *jm(JSMallocState *s,size_t n){
    void *p=heap_caps_malloc(n,MALLOC_CAP_SPIRAM|MALLOC_CAP_8BIT);
    if(p)update(s,0,usable(p));return p;
}
static void jf(JSMallocState *s,void *p){
    if(p){update(s,usable(p),0);heap_caps_free(p);}
}
static void *jr(JSMallocState *s,void *p,size_t n){
    if(!n){jf(s,p);return NULL;}
    size_t old=usable(p);
    void *v=heap_caps_realloc(p,n,MALLOC_CAP_SPIRAM|MALLOC_CAP_8BIT);
    if(v)update(s,old,usable(v));return v;
}
static const JSMallocFunctions alloc={jm,jf,jr,usable};
static void compile_once(int block,int family,int arm){
    const char *srcs[]={ray_src,chess_src};
    char cell[180];snprintf(cell,sizeof(cell),"typedRv32.compile(input,[],undefined,%s).image",options[arm]);
    meter m={0};int64_t start=esp_timer_get_time();JSRuntime *rt=JS_NewRuntime2(&alloc,&m);
    if(!rt){printf("SHERROR no JS runtime\n");return;}
    JS_SetMaxStackSize(rt,56*1024);
    JSContext *ctx=JS_NewContext(rt);
    if(!ctx){JS_FreeRuntime(rt);printf("SHERROR no JS context\n");return;}
    JSValue v=JS_Eval(ctx,shadow_bundle,strlen(shadow_bundle),"compiler.js",JS_EVAL_TYPE_GLOBAL);
    if(JS_IsException(v))goto error;
    JS_FreeValue(ctx,v);
    JSValue g=JS_GetGlobalObject(ctx); JS_SetPropertyStr(ctx,g,"input",JS_NewString(ctx,srcs[family]));JS_FreeValue(ctx,g);
    int64_t lower=esp_timer_get_time();
    v=JS_Eval(ctx,cell,strlen(cell),"compile.js",JS_EVAL_TYPE_GLOBAL);
    int64_t end=esp_timer_get_time();
    if(JS_IsException(v))goto error;
    size_t off,len,width,cap;
    JSValue buf=JS_GetTypedArrayBuffer(ctx,v,&off,&len,&width);
    if(JS_IsException(buf)){JS_FreeValue(ctx,v);goto error;}
    uint8_t *b=JS_GetArrayBuffer(ctx,&cap,buf);uint32_t hash=2166136261u;
    if(!b||off>cap||len>cap-off){printf("SHERROR invalid buffer\n");}
    else {
        for(size_t i=0;i<len;i++)hash=(hash^b[off+i])*16777619u;
        printf("SHCOLD {\"block\":%d,\"family\":%d,\"arm\":%d,\"compileUs\":%lld,\"totalUs\":%lld,\"peakBytes\":%u,\"bytes\":%u,\"match\":%s}\n",block,family,arm,(long long)(end-lower),(long long)(end-start),(unsigned)m.peak,(unsigned)len,hash==expected[family][arm]?"true":"false");
    }
    JS_FreeValue(ctx,buf);JS_FreeValue(ctx,v);
    goto finish;
error: {
    JSValue err=JS_GetException(ctx);const char *s=JS_ToCString(ctx,err);
    printf("SHERROR compile %s\n",s?s:"exception");JS_FreeCString(ctx,s);JS_FreeValue(ctx,err);
}
finish: JS_FreeContext(ctx);JS_FreeRuntime(rt);
}
static void cold_task(void *arg){
    for(int b=0;b<6;b++)for(int f=0;f<2;f++)for(int i=0;i<NMODE;i++){
        compile_once(b,f,(b%2 ? NMODE-1-i+b/2 : i+b/2)%NMODE);vTaskDelay(1);
    }
    xSemaphoreGive((SemaphoreHandle_t)arg);vTaskDelete(NULL);
}
void cold_bench(void){
    SemaphoreHandle_t done=xSemaphoreCreateBinary();
    if(!done || xTaskCreate(cold_task,"cold-cost",64*1024,done,3,NULL)!=pdPASS){
        printf("SHERROR cold task allocation\n"); if(done)vSemaphoreDelete(done);return;
    }
    xSemaphoreTake(done,portMAX_DELAY);vSemaphoreDelete(done);
}
