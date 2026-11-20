/* Included at the end of typed_p4.c in the isolated research firmware. */
#include "esp_elf.h"
#include "esp_log.h"
#include "mbedtls/sha256.h"
#include "editor-oracle.h"

void rebuild_elf_resolver_setup(void);
char *rebuild_editor_compile(size_t *length);

static bool editor_eval_failure(JSContext *ctx) {
    JSValue ex=JS_GetException(ctx);
    const char *msg=JS_ToCString(ctx,ex);
    printf("FRAGERROR %s\n",msg ? msg : "no exception text");
    JS_FreeCString(ctx,msg);
    JS_FreeValue(ctx,ex);
    return false;
}

static JSValue editor_prepare(JSContext *ctx,unsigned mode,unsigned edit) {
    static const char *const programs[][3]={
        {"rebuild/stock-wasm.js","rebuild/stock-rv32.js","rebuild/stock-world.js"},
        {"rebuild/wasm.js","rebuild/rv32.js","rebuild/world.js"},
    };
    for (unsigned i=0;i<3;i++) if (!eval_file(ctx,programs[mode!=0][i])) return JS_EXCEPTION;
    if ((mode && !eval_file(ctx,"rebuild/incremental.js")) || !eval_file(ctx,"rebuild/endpoint.js"))
        return JS_EXCEPTION;
    size_t sn=0,rn=0;
    char *src=p4_bundle_read("editor/editor.typed",&sn,NULL,0);
    char *elf=p4_bundle_read("editor/reactor.bin",&rn,NULL,0);
    JSValue runner=JS_EXCEPTION;
    if (src && elf) {
        JSValue global=JS_GetGlobalObject(ctx);
        JSValue fun=JS_GetPropertyStr(ctx,global,"editorTrial");
        JSValue buffer=JS_NewArrayBufferCopy(ctx,(const uint8_t *)elf,rn);
        JSValue view_args[]={buffer,JS_NewUint32(ctx,0),JS_NewUint32(ctx,rn)};
        JSValue view=JS_IsException(buffer) ? JS_EXCEPTION :
            JS_NewTypedArray(ctx,3,view_args,JS_TYPED_ARRAY_UINT8);
        JSValue args[]={JS_NewStringLen(ctx,src,sn),view,JS_NewUint32(ctx,mode),JS_NewUint32(ctx,edit)};
        if (!JS_IsException(view) && !JS_IsException(args[0])) runner=JS_Call(ctx,fun,JS_UNDEFINED,4,args);
        for (unsigned i=0;i<4;i++) JS_FreeValue(ctx,args[i]);
        JS_FreeValue(ctx,buffer);
        JS_FreeValue(ctx,fun);
        JS_FreeValue(ctx,global);
    }
    free(src); free(elf);
    return runner;
}

typedef struct { vtime_t end,load_us,guest_us; int ret; uint32_t writes[5]; } edit_sample;

static bool editor_guest(const uint8_t *bytes,size_t size,unsigned id,edit_sample *sample) {
    if (size<sizeof(elf32_hdr_t) || ((uintptr_t)bytes & 3)) return false;
    const elf32_hdr_t *h=(const void *)bytes;
    if (h->phoff>size || h->phnum>(size-h->phoff)/sizeof(elf32_phdr_t)) return false;
    const size_t offset=preview_sites[id].entry;
    const elf32_phdr_t *segs=(const void *)(bytes+h->phoff);
    esp_elf_t elf;
    esp_elf_init(&elf);
    const vtime_t start=port_clock();
    int rc=esp_elf_relocate(&elf,bytes,size);
    if (rc) {
        printf("FRAGERROR relocate %d\n",rc);
        esp_elf_deinit(&elf);
        return false;
    }
    uintptr_t ptr=0;
    for (unsigned i=0;i<h->phnum;i++) {
        const elf32_phdr_t *s=segs+i;
        if (s->type==PT_LOAD && (s->flags&1) && offset>=s->offset && offset-s->offset<s->filesz)
            ptr=esp_elf_map_sym(&elf,s->vaddr+offset-s->offset);
    }
    if (!ptr) { esp_elf_deinit(&elf); return false; }
    struct { uint32_t length; uint16_t cells[256]; } rows={.length=256};
    int32_t state[80]={0};
    state[preview_sites[id].rows]=2;
    state[preview_sites[id].units]=5;
    state[preview_sites[id].columns]=7;
    int (*finish)(void *,int32_t *,int32_t)=(void *)ptr;
    const vtime_t enter=port_clock();
    int result=finish(&rows,state,4);
    const vtime_t end=port_clock();
    *sample=(edit_sample){.end=end,.load_us=enter-start,.guest_us=end-enter,.ret=result,
        .writes={rows.cells[198],rows.cells[199],state[preview_sites[id].rows],
                 state[preview_sites[id].units],state[preview_sites[id].columns]}};
    esp_elf_deinit(&elf);
    return result==0 && sample->writes[0]==5 && sample->writes[1]==4 && sample->writes[2]==3 &&
           sample->writes[3]==0 && sample->writes[4]==0;
}

static bool editor_measure(unsigned round,unsigned position,unsigned mode,unsigned edit) {
    compile_heap heap={.limit=6*1024*1024,.deadline=port_clock()+20000000};
    JSRuntime *rt=JS_NewRuntime2(&compiler_allocator,&heap);
    if (!rt) return false;
    JS_SetMaxStackSize(rt,port_js_stack());
    JS_SetInterruptHandler(rt,compile_interrupt,&heap);
    JSContext *ctx=JS_NewContext(rt);
    if (!ctx) { JS_FreeRuntime(rt); return false; }
    bool ok=false;
    JSValue runner=editor_prepare(ctx,mode,edit);
    if (JS_IsException(runner)) { editor_eval_failure(ctx); goto done; }
    JSValue fn=JS_GetPropertyStr(ctx,runner,"compile"), arg=JS_GetPropertyStr(ctx,runner,"changed");
    JS_RunGC(rt);
    const size_t before=heap.live;
    heap.peak=before;
    heap.deadline=port_clock()+15000000;
    const vtime_t start=port_clock();
    JSValue result=JS_Call(ctx,fn,JS_UNDEFINED,1,&arg);
    size_t at=0,size=0,unit=0,capacity=0;
    JSValue buf=JS_IsException(result)? JS_UNDEFINED : JS_GetTypedArrayBuffer(ctx,result,&at,&size,&unit);
    uint8_t *ptr=(JS_IsUndefined(buf)||JS_IsException(buf)) ? NULL : JS_GetArrayBuffer(ctx,&capacity,buf);
    edit_sample sample={0};
    const size_t peak=heap.peak;
    if (ptr && at<=capacity && size<=capacity-at && unit==1 && editor_guest(ptr+at,size,edit,&sample)) {
        uint8_t digest[32];
        mbedtls_sha256(ptr+at,size,digest,0);
        JSValue getter=JS_GetPropertyStr(ctx,runner,"stats");
        JSValue stats=JS_Call(ctx,getter,runner,0,NULL);
        unsigned counts[4]={0};
        ok=!JS_IsException(stats);
        for (unsigned i=0;i<4 && ok;i++) {
            JSValue x=JS_GetPropertyUint32(ctx,stats,i);
            ok=JS_ToUint32(ctx,&counts[i],x)==0;
            JS_FreeValue(ctx,x);
        }
        JS_FreeValue(ctx,stats); JS_FreeValue(ctx,getter);
        if (ok) {
            printf("FRAGROW %u %u %u %u %lld %lld %lld %zu %zu %zu %u %u %u %u %d %u %u %u %u %u ",
                round,position,mode,edit,(long long)(sample.end-start),(long long)sample.load_us,
                (long long)sample.guest_us,before,peak,size,counts[0],counts[1],counts[2],counts[3],
                sample.ret,sample.writes[0],sample.writes[1],sample.writes[2],sample.writes[3],sample.writes[4]);
            for (unsigned i=0;i<32;i++) printf("%02x",digest[i]);
            puts("");
        }
    } else if (JS_IsException(result) || JS_IsException(buf)) editor_eval_failure(ctx);
    else printf("FRAGERROR native return %d writes %u %u %u\n",sample.ret,sample.writes[0],sample.writes[1],sample.writes[2]);
    JS_FreeValue(ctx,buf); JS_FreeValue(ctx,result); JS_FreeValue(ctx,arg); JS_FreeValue(ctx,fn);
done:
    JS_FreeValue(ctx,runner); JS_FreeContext(ctx); JS_FreeRuntime(rt);
    return ok;
}

char *p4_editor_compile(size_t *length) {
    static bool ran;
    if (!ran) {
        ran=true;
        rebuild_elf_resolver_setup();
        esp_log_level_set("ELF",ESP_LOG_NONE);
        puts("FRAGSTART");
        bool ok=true;
        for (unsigned r=0;r<3 && ok;r++) for (unsigned e=0;e<4 && ok;e++)
            for (unsigned p=0;p<3 && ok;p++) ok=editor_measure(r,p,(r+p+e)%3,e);
        puts(ok ? "FRAGDONE" : "FRAGFAIL");
    }
    return rebuild_editor_compile(length);
}
