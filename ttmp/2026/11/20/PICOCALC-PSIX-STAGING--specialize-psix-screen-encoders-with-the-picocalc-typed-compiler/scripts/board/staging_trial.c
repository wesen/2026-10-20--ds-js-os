// Fixed compiled artifact and immutable test inputs. The console selects timing arms only.
#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include "p4.h"
#include "quickjs.h"
#include "esp_elf.h"
#define BX_NOW() port_clock()
#include "binary_native.inc"
#include "binary_producer.inc"
#include "descriptor.h"

typedef int (*encoder_fn)(const struct stage_input *,void *,int);
static esp_elf_t installed;
static encoder_fn entry;
static int install_writer(void) {
    size_t nr=0,np=0,nm=0,ng=0,nexpected=0;
    int result=0;
    vtime_t start=port_clock();
    char *reactor=p4_bundle_read("stage/slot.elf",&nr,NULL,0);
    char *primitives=p4_bundle_read("stage/primitives.typed",&np,NULL,0);
    char *gold=p4_bundle_read("stage/expected.elf",&nexpected,NULL,0);
    char *generator=p4_bundle_read("stage/generator.js",&ng,NULL,0);
    char *source=NULL,*module=NULL;
    if(entry){ entry=NULL; esp_elf_deinit(&installed); }
    JSRuntime *rt=JS_NewRuntime(); JSContext *ctx=rt?JS_NewContext(rt):NULL;
    vtime_t preparation=port_clock(),staged=preparation,compiled=staged,loaded=staged;
    if(!ctx || !reactor || !primitives || !gold || !generator)goto release;
    JS_SetMaxStackSize(rt,port_js_stack());
    JSValue eval=JS_Eval(ctx,generator,ng,"fixed-schema-generator",JS_EVAL_TYPE_GLOBAL);
    bool ok=!JS_IsException(eval);
    JS_FreeValue(ctx,eval);
    if(!ok)goto release;
    JSValue global=JS_GetGlobalObject(ctx),fn=JS_GetPropertyStr(ctx,global,"psixGenerateSource");
    JSValue in=JS_NewStringLen(ctx,primitives,np);
    JSValue residual=JS_Call(ctx,fn,JS_UNDEFINED,1,&in);
    size_t ns=0;
    const char *generated=JS_IsException(residual)?NULL:JS_ToCStringLen(ctx,&ns,residual);
    if(generated && ns>0 && ns<=65536) {
        source=malloc(ns+1);
        if(source)memcpy(source,generated,ns+1);
    }
    if(generated)JS_FreeCString(ctx,generated);
    JS_FreeValue(ctx,residual);JS_FreeValue(ctx,in);JS_FreeValue(ctx,fn);JS_FreeValue(ctx,global);
    JS_FreeContext(ctx);ctx=NULL;JS_FreeRuntime(rt);rt=NULL;
    staged=port_clock();
    if(!source)goto release;
    p4_compile_limits limits={.heap_bytes=6*1024*1024,.duration_us=4500000};
    module=p4_typed_compile("stage","schema",source,ns,"stage/link.js","linkStaged",ENG_NATIVE,reactor,nr,&nm,staged,&limits);
    compiled=port_clock();
    if(!module || nm!=nexpected || memcmp(module,gold,nm)) {puts("STAGE incorrect compiler image");goto release;}
    if(esp_elf_init(&installed)!=0)goto release;
    if(esp_elf_relocate(&installed,(uint8_t*)module,nm)!=0){esp_elf_deinit(&installed);goto release;}
    char *args[]={(char *)&entry};
    if(esp_elf_request(&installed,0,1,args)!=0 || !entry){esp_elf_deinit(&installed);entry=NULL;goto release;}
    loaded=port_clock(); result=1;
    printf("STAGE DATA {\"arm\":\"install\",\"prepUs\":%lld,\"generateUs\":%lld,\"compileUs\":%lld,\"qualifyLoadUs\":%lld,\"totalUs\":%lld,\"sourceBytes\":%u,\"elfBytes\":%u}\n",
        (long long)(preparation-start),(long long)(staged-preparation),(long long)(compiled-staged),
        (long long)(loaded-compiled),(long long)(loaded-start),(unsigned)ns,(unsigned)nm);
release:
    if(ctx)JS_FreeContext(ctx);
    if(rt)JS_FreeRuntime(rt);
    free(module);free(source);free(gold);free(generator);free(primitives);free(reactor);
    return result;
}
struct out_buffer {uint32_t length; uint16_t cells[288];};
static void run_arm(char arm,int repetitions) {
    if(!entry){puts("STAGE ERROR install first");return;}
    enum { COUNT=sizeof(stage_cases)/sizeof(*stage_cases) };
    vtime_t total=0,verify=0;
    unsigned checked=0;
    struct out_buffer out;
    for(int j=0;j<COUNT;j++) {
        const struct stage_input *input=&stage_cases[j].input;
        unsigned length=stage_cases[j].length;
        cJSON *tree=arm=='G'?cJSON_Parse(stage_cases[j].json):NULL;
        if(arm=='G' && !tree) {puts("STAGE ERROR missing tree");return;}
        for(int k=0;k<repetitions;k++) {
            size_t n=0,scratch=0; int result=-1;
            uint8_t *bytes=(uint8_t*)out.cells;
            out.length=288;memset(bytes,0xa5,sizeof out.cells);
            vtime_t a=port_clock();
            if(arm=='N') result=entry(input,&out,sizeof out.cells);
            else if(arm=='T') result=stage_plan(input,bytes,sizeof out.cells);
            else {bytes=bp_encode(tree,&n,&scratch);result=bytes?(int)n:-1;}
            vtime_t b=port_clock();
            bool valid=result==(int)length && bytes && memcmp(bytes,stage_cases[j].wire,length)==0;
            if(arm!='G')valid=valid && bytes[length]==0xa5;
            vtime_t c=port_clock();
            if(arm=='G')free(bytes);
            if(!valid){printf("STAGE ERROR witness %c %d len=%d expected=%u\n",arm,j,result,length);cJSON_Delete(tree);return;}
            total+=b-a;verify+=c-b;checked++;
        }
        cJSON_Delete(tree);
    }
    printf("STAGE DATA {\"arm\":\"%c\",\"encodeUs\":%lld,\"verifyUs\":%lld,\"count\":%u,\"states\":%u}\n",arm,(long long)total,(long long)verify,checked,(unsigned)COUNT);
}
#ifdef PSIX_PATCH_FOLLOWUP
#include "patch.h"
#include "stage_churn.h"
typedef int (*plan_fn)(const struct stage_input *,uint8_t *,size_t);
static plan_fn resident_table;
static esp_elf_t table_module;
static void load_table(void) {
    if(resident_table){esp_elf_deinit(&table_module);resident_table=NULL;}
    size_t n=0;vtime_t started=port_clock();
    char *code=p4_bundle_read("stage/table.elf",&n,NULL,0);
    int rc=code?esp_elf_init(&table_module):-1;
    if(!rc)rc=esp_elf_relocate(&table_module,(uint8_t *)code,n);
    if(!rc){char *args[]={(char *)&resident_table};rc=esp_elf_request(&table_module,0,1,args);}
    if(rc || !resident_table)printf("STAGE ERROR table ELF %d\n",rc);
    else printf("STAGE DATA {\"arm\":\"tableload\",\"bytes\":%u,\"loadUs\":%lld}\n",(unsigned)n,(long long)(port_clock()-started));
    free(code);
}
static void load_prebuilt(void) {
    size_t n=0;vtime_t start=port_clock();
    char *code=p4_bundle_read("stage/expected.elf",&n,NULL,0);
    esp_elf_t mod={0};encoder_fn prebuilt=NULL;
    int rc=code?esp_elf_init(&mod):-1;
    if(!rc)rc=esp_elf_relocate(&mod,(uint8_t *)code,n);
    if(!rc){char *args[]={(char *)&prebuilt};rc=esp_elf_request(&mod,0,1,args);}
    vtime_t end=port_clock();struct out_buffer out={.length=288};
    if(rc || !prebuilt || prebuilt(&stage_cases[0].input,&out,sizeof out.cells)!=(int)stage_cases[0].length ||
        memcmp(out.cells,stage_cases[0].wire,stage_cases[0].length))puts("STAGE ERROR prebuilt");
    else printf("STAGE DATA {\"arm\":\"prebuilt\",\"bytes\":%u,\"loadUs\":%lld}\n",(unsigned)n,(long long)(end-start));
    esp_elf_deinit(&mod);free(code);
}
static void patch_trial(char arm, char stream) {
    if(!entry || !resident_table){puts("STAGE ERROR load both writers first");return;}
    enum { COUNT=sizeof(stage_cases)/sizeof(*stage_cases) };
    struct stage_cache cache={0};
    struct out_buffer out;
    unsigned calls=0; vtime_t elapsed=0;
    unsigned count=stream=='c'?24:stream=='s'?20:COUNT;
    for(unsigned j=0;j<count;j++) {
        const struct stage_patch_fixture *alternative=stream=='c'? &stage_patch_churn[j%3] :
                                                       stream=='s'? &stage_patch_replay[j] : NULL;
        const struct stage_input *in=alternative? &alternative->input : &stage_cases[j].input;
        size_t length=alternative? alternative->length : stage_cases[j].length;
        const uint8_t *expected=alternative? alternative->wire : stage_cases[j].wire;
        const char *json=alternative?alternative->json:stage_cases[j].json;
        cJSON *tree=arm=='G'?cJSON_Parse(json):NULL;
        if(arm=='G' && !tree){puts("STAGE ERROR tree");return;}
        out.length=288;memset(out.cells,0xa5,sizeof out.cells);
        uint8_t *wire=(uint8_t*)out.cells;int n=-1;
        vtime_t start=port_clock();
        switch(arm) {
        case 'F':n=stage_cached(&cache,in,wire,sizeof out.cells);break;
        case 'R':n=resident_table(in,wire,sizeof out.cells);break;
        case 'T':n=stage_plan(in,wire,sizeof out.cells);break;
        case 'N':n=entry(in,&out,sizeof out.cells);break;
        case 'G':{size_t size=0,scratch=0;wire=bp_encode(tree,&size,&scratch);n=(int)size;break;}
        }
        elapsed+=port_clock()-start;
        bool ok=wire && n==(int)length && !memcmp(expected,wire,length);
        if(arm!='G')ok=ok && wire[length]==0xa5;
        if(arm=='G')free(wire);
        cJSON_Delete(tree);
        if(!ok){printf("STAGE ERROR followup %c %u %d\n",arm,j,n);return;}
        calls++;
    }
    printf("STAGE DATA {\"arm\":\"%c%c\",\"encodeUs\":%lld,\"count\":%u,\"hits\":%u,\"misses\":%u,\"cacheBytes\":%u}\n",stream,arm,(long long)elapsed,calls,(unsigned)cache.hits,(unsigned)cache.misses,(unsigned)sizeof cache);
}
#endif
static JSValue stage_clock(JSContext *ctx, JSValueConst thisval, int argc, JSValueConst *args) {
    return JS_NewInt64(ctx,port_clock());
}
static int adaptive_interrupt(JSRuntime *rt, void *deadline) {
    return port_clock()>*(vtime_t *)deadline;
}
static void run_adaptive(const char *arm) {
    size_t size=0;
    char *script=p4_bundle_read("stage/adaptive.js",&size,NULL,0);
    JSRuntime *rt=JS_NewRuntime();
    JSContext *ctx=rt?JS_NewContext(rt):NULL;
    vtime_t deadline=port_clock()+8000000;
    if(!ctx || !script) {puts("STAGE ERROR JS setup"); goto done;}
    JS_SetInterruptHandler(rt,adaptive_interrupt,&deadline);
    JS_SetMemoryLimit(rt,6*1024*1024);
    JS_SetMaxStackSize(rt,port_js_stack());
    JSValue global=JS_GetGlobalObject(ctx);
    JS_SetPropertyStr(ctx,global,"stageMicros",JS_NewCFunction(ctx,stage_clock,"stageMicros",0));
    JSValue eval=JS_Eval(ctx,script,size,"fixed-adaptive-replay",JS_EVAL_TYPE_GLOBAL);
    if(!JS_IsException(eval)) {
        JSValue fn=JS_GetPropertyStr(ctx,global,"stageAdaptiveRun"),arg=JS_NewString(ctx,arm);
        JSValue result=JS_Call(ctx,fn,JS_UNDEFINED,1,&arg);
        if(!JS_IsException(result)) {
            JS_SetPropertyStr(ctx,result,"arm",JS_NewString(ctx,arm));
            JSValue json=JS_JSONStringify(ctx,result,JS_UNDEFINED,JS_UNDEFINED);
            const char *text=JS_ToCString(ctx,json);
            if(text){printf("STAGE DATA %s\n",text);JS_FreeCString(ctx,text);}
            JS_FreeValue(ctx,json);
        } else {
            JSValue error=JS_GetException(ctx);const char *text=JS_ToCString(ctx,error);
            printf("STAGE ERROR adaptive %.160s\n",text?text:"failed");
            JS_FreeCString(ctx,text);JS_FreeValue(ctx,error);
        }
        JS_FreeValue(ctx,result);JS_FreeValue(ctx,arg);JS_FreeValue(ctx,fn);
    } else puts("STAGE ERROR evaluating adaptive fixture");
    JS_FreeValue(ctx,eval);JS_FreeValue(ctx,global);
done:
    if(ctx)JS_FreeContext(ctx);
    if(rt)JS_FreeRuntime(rt);
    free(script);
}
void staging_trial(const char *arguments) {
    char arm[16]; int repetitions=0;
    if(sscanf(arguments,"%15s %d",arm,&repetitions)!=2) {puts("STAGE ERROR arguments");return;}
    if(!strcmp(arm,"install")) {if(!install_writer())puts("STAGE ERROR compiler install");}
#ifdef PSIX_PATCH_FOLLOWUP
    else if(!strcmp(arm,"tableload"))load_table();
    else if(!strcmp(arm,"prebuilt"))load_prebuilt();
    else if(strlen(arm)==2 && strchr("psc",arm[0]) && strchr("FRTNG",arm[1]))patch_trial(arm[1],arm[0]);
#endif
    else if(strlen(arm)==1 && strchr("NTG",arm[0]) && repetitions>=1 && repetitions<=8)run_arm(arm[0],repetitions);
    else if(strchr(arm,'-') && repetitions==1) run_adaptive(arm);
    else puts("STAGE ERROR arm");
}
