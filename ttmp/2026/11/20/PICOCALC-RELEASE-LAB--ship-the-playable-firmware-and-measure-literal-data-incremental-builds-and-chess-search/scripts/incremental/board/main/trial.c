#include <errno.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>
#include "quickjs.h"
#include "typed_lex_index.h"
#include "esp_heap_caps.h"
#include "esp_rom_crc.h"
#include "esp_timer.h"
#include "esp_vfs_fat.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define BLOB(k) extern const uint8_t k##_start[],k##_end[]
BLOB(helper); BLOB(stock); BLOB(candidate); BLOB(session); BLOB(gold);
BLOB(chess_typed); BLOB(chess_elf); BLOB(editor_typed); BLOB(editor_elf);
static bool mounted;
static JSValue now(JSContext *c,JSValueConst s,int n,JSValueConst *v) {return JS_NewInt64(c,esp_timer_get_time());}
static JSValue emit(JSContext *c,JSValueConst s,int n,JSValueConst *v) {
    const char *text=JS_ToCString(c,v[0]);if(!text)return JS_EXCEPTION;
    printf("INC_ROW %s\n",text);JS_FreeCString(c,text);return JS_UNDEFINED;
}
static JSValue crc(JSContext *c,JSValueConst s,int n,JSValueConst *v) {
    size_t len;uint32_t at,sz;uint8_t *p=JS_GetArrayBuffer(c,&len,v[0]);
    if(!p||JS_ToUint32(c,&at,v[1])<0||JS_ToUint32(c,&sz,v[2])<0||at>len||sz>len-at)
        return JS_ThrowTypeError(c,"bad CRC range");
    return JS_NewUint32(c,esp_rom_crc32_le(0,p+at,sz));
}
static bool transfer(int fd,char *p,size_t length,bool writing) {
    while(length){ssize_t n=writing?write(fd,p,length):read(fd,p,length);
        if(n<=0)return false;
        p+=n;length-=n;
    }
    return true;
}
static JSValue checkpoint(JSContext *c,JSValueConst self,int argc,JSValueConst *argv) {
    const char *file="/files/incbench.tmp";
    size_t size;const char *raw=JS_ToCStringLen(c,&size,argv[0]);if(!raw)return JS_EXCEPTION;
    if(size>2*1024*1024){JS_FreeCString(c,raw);return JS_ThrowRangeError(c,"checkpoint limit");}
    char *data=heap_caps_malloc(size+1,MALLOC_CAP_SPIRAM|MALLOC_CAP_8BIT);
    if(!data){JS_FreeCString(c,raw);return JS_ThrowOutOfMemory(c);}
    int64_t t=esp_timer_get_time();int fd=mounted?open(file,O_CREAT|O_EXCL|O_WRONLY,0600):-1;
    bool own=fd>=0, ok=false;int64_t write_us=0,read_us=0;
    uint32_t hash=esp_rom_crc32_le(0,(const uint8_t*)raw,size);
    if(own){
        ok=transfer(fd,(char*)&hash,sizeof(hash),true)&&transfer(fd,(char*)raw,size,true)&&fsync(fd)==0;
        if(close(fd)!=0)ok=false;
        write_us=esp_timer_get_time()-t;t=esp_timer_get_time();
        fd=ok?open(file,O_RDONLY):-1;uint32_t got=0;
        if(fd>=0){
            ok=transfer(fd,(char*)&got,sizeof(got),false)&&transfer(fd,data,size,false)&&
               got==esp_rom_crc32_le(0,(const uint8_t*)data,size);
            if(close(fd)!=0)ok=false;
        }else ok=false;
        read_us=esp_timer_get_time()-t;
        if(unlink(file)!=0)ok=false;
    }
    if(!own){memcpy(data,raw,size);ok=true;}
    JS_FreeCString(c,raw);
    if(!ok){free(data);return JS_ThrowInternalError(c,"exclusive checkpoint persistence failed");}
    JSValue a=JS_NewArray(c);
    JS_SetPropertyUint32(c,a,0,JS_NewStringLen(c,data,size));free(data);
    JS_SetPropertyUint32(c,a,1,JS_NewInt64(c,write_us));
    JS_SetPropertyUint32(c,a,2,JS_NewInt64(c,read_us));
    JS_SetPropertyUint32(c,a,3,JS_NewBool(c,own));
    return a;
}
static bool eval(JSContext *c,const uint8_t *s,size_t n,const char *label) {
    JSValue v=JS_Eval(c,(const char*)s,n,label,JS_EVAL_TYPE_GLOBAL);
    if(JS_IsException(v)){
        JSValue e=JS_GetException(c);const char *msg=JS_ToCString(c,e);
        printf("INC_ERROR %s: %.160s\n",label,msg?msg:"exception");
        JS_FreeCString(c,msg);JS_FreeValue(c,e);return false;
    }
    JS_FreeValue(c,v);return true;
}
#define EVAL_BLOB(k) eval(c,k##_start,k##_end-k##_start,#k)
typedef struct {size_t live,peak;} heap_stats;
static size_t usable(const void *p){return p?heap_caps_get_allocated_size((void*)p):0;}
static void change(heap_stats *s,size_t old,size_t n){s->live=s->live-old+n;if(s->live>s->peak)s->peak=s->live;}
static void *alloc_js(JSMallocState *s,size_t n){
    void *p=heap_caps_malloc(n,MALLOC_CAP_SPIRAM|MALLOC_CAP_8BIT);
    if(p)change(s->opaque,0,usable(p));
    return p;
}
static void free_js(JSMallocState *s,void *p){if(p){change(s->opaque,usable(p),0);free(p);}}
static void *realloc_js(JSMallocState *s,void *p,size_t n){
    if(!p)return alloc_js(s,n);
    if(!n){free_js(s,p);return NULL;}
    size_t old=usable(p);void *v=heap_caps_realloc(p,n,MALLOC_CAP_SPIRAM|MALLOC_CAP_8BIT);
    if(v)change(s->opaque,old,usable(v));
    return v;
}
static const JSMallocFunctions allocator={alloc_js,free_js,realloc_js,usable};
static bool cold(bool chess,bool cached) {
    const char *app=chess?"chess":"editor";
    const uint8_t *src=chess?chess_typed_start:editor_typed_start,*se=chess?chess_typed_end:editor_typed_end;
    const uint8_t *elf=chess?chess_elf_start:editor_elf_start,*ee=chess?chess_elf_end:editor_elf_end;
    heap_stats mem={0};int64_t begin=esp_timer_get_time();
    JSRuntime *rt=JS_NewRuntime2(&allocator,&mem);if(!rt)return false;
    JS_SetMaxStackSize(rt,56*1024);
    JSContext *c=JS_NewContext(rt);if(!c){JS_FreeRuntime(rt);return false;}
    bool ok=typed_lex_index_install(c) && (cached?(EVAL_BLOB(candidate)&&EVAL_BLOB(helper)):EVAL_BLOB(stock));
    JSValue g=JS_GetGlobalObject(c);
    JS_SetPropertyStr(c,g,"source",JS_NewStringLen(c,(const char*)src,se-src));
    JS_SetPropertyStr(c,g,"buffer",JS_NewArrayBufferCopy(c,elf,ee-elf));
    const char *expr=cached?"globalThis.activeFragments=fragmentSession(null); globalThis.result=compileTypedWorldRv32(source,new Uint8Array(buffer));":
          "globalThis.result=compileTypedWorldRv32(source,new Uint8Array(buffer));";
    if(ok)ok=eval(c,(const uint8_t*)expr,strlen(expr),"fresh build");
    int64_t us=esp_timer_get_time()-begin;uint32_t digest=0;
    if(ok){
        JSValue bytes=JS_GetPropertyStr(c,g,"result");size_t off,len,stride,capacity;
        JSValue buf=JS_GetTypedArrayBuffer(c,bytes,&off,&len,&stride);
        uint8_t *p=JS_GetArrayBuffer(c,&capacity,buf);ok=p && off+len<=capacity;
        if(ok)digest=esp_rom_crc32_le(0,p+off,len);
        JS_FreeValue(c,buf);JS_FreeValue(c,bytes);
    }
    printf("INC_COLD %s %s %lld %u %u\n",app,cached?"fragment":"clean",(long long)us,(unsigned)mem.peak,(unsigned)digest);
    JS_FreeValue(c,g);JS_FreeContext(c);JS_FreeRuntime(rt);return ok;
}
static bool run(bool chess) {
    heap_stats mem={0}; JSRuntime *rt=JS_NewRuntime2(&allocator,&mem);if(!rt)return false;
    JS_SetMaxStackSize(rt,56*1024);
    JSContext *c=JS_NewContext(rt);if(!c){JS_FreeRuntime(rt);return false;}
    JSValue g=JS_GetGlobalObject(c);
    JS_SetPropertyStr(c,g,"micros",JS_NewCFunction(c,now,"micros",0));
    JS_SetPropertyStr(c,g,"crc",JS_NewCFunction(c,crc,"crc",3));
    JS_SetPropertyStr(c,g,"emit",JS_NewCFunction(c,emit,"emit",1));
    JS_SetPropertyStr(c,g,"checkpoint",JS_NewCFunction(c,checkpoint,"checkpoint",1));
    const uint8_t *src=chess?chess_typed_start:editor_typed_start,*end=chess?chess_typed_end:editor_typed_end;
    const uint8_t *elf=chess?chess_elf_start:editor_elf_start,*ee=chess?chess_elf_end:editor_elf_end;
    const char *app=chess?"chess":"editor";
    JS_SetPropertyStr(c,g,"src",JS_NewStringLen(c,(const char*)src,end-src));
    JS_SetPropertyStr(c,g,"elf",JS_NewArrayBufferCopy(c,elf,ee-elf));
    JS_SetPropertyStr(c,g,"nameOfApp",JS_NewString(c,app));
    JS_SetPropertyStr(c,g,"oracle",JS_ParseJSON(c,(const char*)gold_start,gold_end-gold_start,"gold.json"));
    JS_FreeValue(c,g);
    int64_t started=esp_timer_get_time();
    bool ok=typed_lex_index_install(c)&&EVAL_BLOB(stock)&&EVAL_BLOB(candidate)&&EVAL_BLOB(session);
    printf("INC_READY %s %lld\n",app,(long long)(esp_timer_get_time()-started));
    const char runner[]=
        "function cleanSource(text,elf){"
        "[globalThis.typedWasm,globalThis.typedAsync,globalThis.typedRv32]=stockGlobals;"
        "try{return stockGlobals[3](text,elf);}finally{"
        "[globalThis.typedWasm,globalThis.typedAsync,globalThis.typedRv32]=candidateGlobals;}}"
        "runTrial(nameOfApp,src,elf,cleanSource,oracle[nameOfApp]);";
    if(ok)ok=eval(c,(const uint8_t*)runner,strlen(runner),"measurement");
    printf("INC_MEM %s %u\n",app,(unsigned)mem.peak);
    JS_FreeContext(c);JS_FreeRuntime(rt);return ok;
}
static void task(void *unused) {
    vTaskDelay(pdMS_TO_TICKS(2500));
    const esp_vfs_fat_mount_config_t cfg={.format_if_mount_failed=false,.max_files=2,.allocation_unit_size=4096};
    wl_handle_t wl=WL_INVALID_HANDLE;mounted=esp_vfs_fat_spiflash_mount_rw_wl("/files","files",&cfg,&wl)==ESP_OK;
    printf("INC_BEGIN mounted=%d\n",(int)mounted);
    bool ok=cold(false,false)&&cold(false,true)&&cold(true,false)&&cold(true,true)&&run(false)&&run(true);
    if(mounted && esp_vfs_fat_spiflash_unmount_rw_wl("/files",wl)!=ESP_OK)ok=false;
    printf("INC_DONE %s\n",ok?"ok":"FAIL");
    for(;;)vTaskDelay(pdMS_TO_TICKS(10000));
}
void app_main(void) {
    if(xTaskCreatePinnedToCoreWithCaps(task,"inc-test",80*1024,NULL,4,NULL,0,MALLOC_CAP_INTERNAL|MALLOC_CAP_8BIT)!=pdPASS)
        puts("INC_DONE ALLOCATION_FAILED");
}
