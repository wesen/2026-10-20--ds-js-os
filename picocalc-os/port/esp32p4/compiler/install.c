// One operator-owned development slot. The worker builds immutable bytes;
// only the kernel task activates worlds and publishes the trusted NVS record.
#include "install.h"
#include "compiler_job.h"
#include "p4.h"
#include "esp_app_desc.h"
#include "esp_elf.h"
#include "esp_heap_caps.h"
#include "freertos/idf_additions.h"
#include "esp_timer.h"
#include "mbedtls/sha256.h"
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// clang -fstack-usage: slas_main (65,696 B) calls static_shape (70,224 B).
#define WORKER_STACK (256 * 1024)
#define SOURCE_LIMIT (32 * 1024)
#define MODULE_LIMIT (384 * 1024)
#define SCRATCH_LIMIT (18 * 1024 * 1024)
typedef struct {
    uint8_t version, slot, engine, automatic;
    uint8_t source[32], firmware[32], artifact[32];
} install_record_t;
static install_record_t active, candidate;
static compiler_job_t job;
static QueueHandle_t finished;
static TaskHandle_t worker;
static enum { READY, LOADING, BUILDING, STARTING } state;
static char *output, *old_source;
static size_t output_size, old_size;
static int old_engine, candidate_epoch;
static bool reuse;
static int64_t began;

// Include the header in the allocation limit and preserve 16-byte alignment.
typedef struct allocation {
    struct allocation *next, *prev;
    size_t size;
    uint32_t pad;
} allocation;
static allocation head = { .next=&head, .prev=&head };
static size_t held, peak;
static int64_t last_yield;
static void *allocate(size_t size) {
    if (esp_timer_get_time()-last_yield>20000) {
        vTaskDelay(1);
        last_yield=esp_timer_get_time();
    }
    if (size > SCRATCH_LIMIT-sizeof(allocation) || held > SCRATCH_LIMIT-sizeof(allocation)-size) return NULL;
    allocation *p=port_heap_malloc(sizeof(*p)+size);
    if (!p) return NULL;
    p->size=size; p->prev=&head; p->next=head.next; head.next->prev=p; head.next=p;
    held+=size+sizeof(*p);
    if (held>peak) peak=held;
    return p+1;
}
static void release(void *bytes) {
    if (!bytes) return;
    allocation *p=(allocation *)bytes-1;
    p->prev->next=p->next; p->next->prev=p->prev;
    held-=p->size+sizeof(*p); port_heap_free(p);
}
static void *resize(void *bytes, size_t size) {
    if (!bytes) return allocate(size);
    size_t old=((allocation *)bytes-1)->size;
    if (size<=old) return bytes;
    void *p=allocate(size);
    if (p) { memcpy(p,bytes,old); release(bytes); }
    return p;
}
static double compiler_math(unsigned op, double x, double y) {
    static double (*const unary[])(double)={sin,cos,tan,asin,acos,atan,sinh,cosh,tanh,asinh,acosh,atanh,exp,log,log10,log2,sqrt,cbrt};
    static double (*const binary[])(double,double)={atan2,fmod,pow,hypot,nextafter};
    if (op<18) return unary[op](x);
    return op<23 ? binary[op-18](x,y) : NAN;
}
static char *read_bounded_file(const char *path, size_t limit, size_t *length) {
    FILE *fp=fopen(path,"rb");
    if (!fp) return NULL;
    char *data=NULL;
    if (fseek(fp,0,SEEK_END)==0) {
        long size=ftell(fp);
        if (size>=0 && (size_t)size<=limit && fseek(fp,0,SEEK_SET)==0) {
            data=malloc((size_t)size+1);
            if (data && fread(data,1,size,fp)==(size_t)size) { data[size]=0; *length=size; }
            else { free(data); data=NULL; }
        }
    }
    fclose(fp);
    return data;
}
static const char *artifact_path(unsigned slot) { return slot ? "/files/cjidev/b.elf" : "/files/cjidev/a.elf"; }
static const char *source_path(unsigned slot) { return slot ? "/files/cjidev/b.js" : "/files/cjidev/a.js"; }
static bool write_file(const char *path,const void *bytes,size_t len) {
    FILE *fp=fopen(path,"wb");
    if (!fp) return false;
    bool ok=fwrite(bytes,1,len,fp)==len;
    return fclose(fp)==0 && ok;
}
static bool digest(const void *bytes,size_t len,uint8_t out[32]) {
    return mbedtls_sha256((const unsigned char *)bytes,len,out,0)==0;
}
static bool matches(const void *bytes,size_t len,const uint8_t expected[32]) {
    uint8_t hash[32];
    return digest(bytes,len,hash) && !memcmp(hash,expected,32);
}
static void cleanup(void) {
    free((void *)job.source); job.source=NULL;
    free(output); output=NULL;
    free(old_source); old_source=NULL;
    state=READY;
}
static esp_elf_t tool;
static char *tool_image;
static size_t tool_size;
static void signal_kernel(void) {
    int done=1;
    xQueueSend(finished,&done,portMAX_DELAY);
}
static void memory_sample(const char *phase) {
    printf("cji: %s elapsed_ms=%lld psram_free=%u psram_largest=%u\n", phase,
           (long long)((esp_timer_get_time()-began)/1000),
           (unsigned)heap_caps_get_free_size(MALLOC_CAP_SPIRAM),
           (unsigned)heap_caps_get_largest_free_block(MALLOC_CAP_SPIRAM));
}
static void build_one(void) {
    memory_sample("begin");
    tool_image=port_read_file("natives/compiler.elf",&tool_size);
    job.exports=port_read_file("compiler/unit.list",&job.exports_length);
    signal_kernel();
    // ELF relocation flushes the instruction cache with both CPUs stopped.
    // The kernel task performs that step on its internal stack.
    ulTaskNotifyTake(pdTRUE,portMAX_DELAY);
    peak=0;
    if (!job.error[0]) {
        char *args[]={(char *)&job};
        memory_sample("relocated");
        esp_elf_request(&tool,0,1,args);
        memory_sample(job.status ? "compiler refused" : "assembled");
        if (!job.status && job.module_length<=MODULE_LIMIT) {
            output=malloc(job.module_length);
            if (output) { output_size=job.module_length; memcpy(output,job.module,output_size); }
        }
        if (!job.status && !output) snprintf(job.error,sizeof job.error,"module size or allocation");
    }
    esp_elf_deinit(&tool);
    free((void *)job.exports);
    while (head.next!=&head) release(head.next+1);
    memory_sample("released");
    signal_kernel();
}
static void build_worker(void *arg) {
    (void)arg;
    for (;;) {
        ulTaskNotifyTake(pdTRUE,portMAX_DELAY);
        build_one();
    }
}
static void begin(char *source,size_t len,bool automatic) {
    memset(&candidate,0,sizeof candidate);
    candidate.version=1; candidate.slot=active.version ? !active.slot : 0;
    candidate.engine=ENG_NATIVE; candidate.automatic=automatic;
    memcpy(candidate.firmware,esp_app_get_description()->app_elf_sha256,32);
    if (!digest(source,len,candidate.source)) { free(source); puts("cji: hash failed"); return; }
    job=(compiler_job_t){.source=source,.length=len,.alloc=allocate,.resize=resize,.release=release,
        .format=vsnprintf,.number=strtod,.math=compiler_math,.micros=esp_timer_get_time,.status=-1};
    began=esp_timer_get_time();
    reuse=active.version && active.automatic==automatic &&
         !memcmp(candidate.firmware,active.firmware,32) && !memcmp(candidate.source,active.source,32);
    if (reuse) {
        // A manual reinstall must repair a damaged saved source as well as a
        // damaged ELF. Both files are required to restore the slot at boot.
        size_t saved_size=0;
        char *saved=read_bounded_file(source_path(active.slot),SOURCE_LIMIT,&saved_size);
        bool source_intact=saved && saved_size==len && !memcmp(saved,source,len);
        free(saved);
        if (source_intact)
            output=read_bounded_file(artifact_path(active.slot),MODULE_LIMIT,&output_size);
        if (output && matches(output,output_size,active.artifact)) {
            candidate=active;
            state=BUILDING; job.status=0;
            puts("cji: verified cache hit");
            return;
        }
        free(output); output=NULL; reuse=false;
    }
    if (!finished) finished=xQueueCreate(1,sizeof(int));
    if (!worker && finished)
        xTaskCreatePinnedToCoreWithCaps(build_worker,"cji-build",WORKER_STACK,NULL,2,&worker,0,MALLOC_CAP_SPIRAM|MALLOC_CAP_8BIT);
    if (!worker || !finished) {
        puts("cji: cannot allocate compiler task"); cleanup(); return;
    }
    state=LOADING;
    xTaskNotifyGive(worker);
    puts("cji: compiling source on device");
}
void compiler_console(const char *command) {
    if (state!=READY) { puts("cji: busy"); return; }
    const char *path=strchr(command,' ');
    bool automatic=!strncmp(command,"install ",8);
    if (!path || (!automatic && strncmp(command,"build ",6)) || !fs_path_ok(++path)) {
        puts("cji build PATH | cji install PATH"); return;
    }
    char full[FS_PATH_MAX+8];
    snprintf(full,sizeof full,"/files/%s",path);
    size_t len=0;
    char *source=read_bounded_file(full,SOURCE_LIMIT,&len);
    if (!source || memchr(source,0,len)) { free(source); puts("cji: expected bounded JavaScript source"); return; }
    begin(source,len,automatic);
}
void compiler_restore(void) {
    size_t n=0;
    char *bytes=port_store_get("k","cji-installed",&n);
    if (bytes && n==sizeof active) memcpy(&active,bytes,n);
    free(bytes);
    if (active.version!=1 || active.slot>1 || active.automatic>1 ||
        (active.engine!=ENG_NATIVE && active.engine!=ENG_JS)) { memset(&active,0,sizeof active); return; }
    char *src=read_bounded_file(source_path(active.slot),SOURCE_LIMIT,&n);
    if (!src || !matches(src,n,active.source)) { puts("cji: installed source missing or changed"); free(src); return; }
    begin(src,n,active.automatic);
}
static void rollback(void) {
    char why[128];
    if (old_source) {
        if (kernel_develop(old_source,old_size,old_engine,why,sizeof why)) printf("cji: rollback failed: %s\n",why);
    } else {
        world_t *w=world_by_name("dev-cji");
        if (w) kernel_stop_world(w,"compiler");
    }
    cleanup();
}
void compiler_tick(void) {
    world_t *w=world_by_name("dev-cji");
    if (state==STARTING) {
        if (!w || w->epoch!=candidate_epoch || w->last_error[0]) { puts("cji: candidate failed during boot"); rollback(); return; }
        if (w->boot_ready || w->status!=W_IDLE || w->in_turn || (w->has_start && w->mbox)) return;
        if (!reuse && port_store_set("k","cji-installed",&candidate,sizeof candidate)) {
            puts("cji: install record commit failed"); rollback(); return;
        }
        active=candidate;
        printf("cji: artifact %u bytes sha256=",(unsigned)output_size);
        for (size_t i=0;i<sizeof active.artifact;i++) printf("%02x",active.artifact[i]);
        putchar('\n');
        printf("cji: ready dev-cji engine=%s cache=%s elapsed_ms=%lld scratch_peak=%u\n",
            candidate.engine==ENG_JS ? "js":"native",reuse ? "hit":"miss",
            (long long)((esp_timer_get_time()-began)/1000),(unsigned)(reuse ? 0:peak));
        cleanup(); return;
    }
    int done;
    if (state==LOADING) {
        if (xQueueReceive(finished,&done,0)!=pdTRUE) return;
        esp_elf_init(&tool);
        if (!tool_image || !job.exports) snprintf(job.error,sizeof job.error,"compiler bundle allocation");
        else {
            int rc=esp_elf_relocate(&tool,(const uint8_t *)tool_image,tool_size);
            if (rc) snprintf(job.error,sizeof job.error,"compiler relocation %d",rc);
        }
        free(tool_image); tool_image=NULL;
        state=BUILDING;
        xTaskNotifyGive(worker);
        return;
    }
    if (state!=BUILDING) return;
    if (!reuse && xQueueReceive(finished,&done,0)!=pdTRUE) return;
    if (!output && job.status==1 && candidate.automatic) {
        output_size=job.length;
        output=malloc(output_size+1);
        if (output) memcpy(output,job.source,output_size+1);
        candidate.engine=ENG_JS;
        printf("cji: testing QuickJS fallback after %.160s\n",job.error);
    }
    if (!output) { printf("cji: build failed: %s\n",job.error); cleanup(); return; }
    if (!reuse) {
        fs_mkdirs("cjidev");
        if (!digest(output,output_size,candidate.artifact) ||
            !write_file(source_path(candidate.slot),job.source,job.length) ||
            !write_file(artifact_path(candidate.slot),output,output_size)) {
            puts("cji: staging write failed"); cleanup(); return;
        }
    }
    if (w && w->source) {
        old_size=w->source_len; old_engine=w->engine; old_source=malloc(old_size+1);
        if (!old_source) { puts("cji: rollback buffer allocation failed"); cleanup(); return; }
        memcpy(old_source,w->source,old_size+1);
    }
    char why[128];
    if (kernel_develop(output,output_size,candidate.engine,why,sizeof why)) {
        printf("cji: activation refused: %s\n",why); cleanup(); return;
    }
    candidate_epoch=world_by_name("dev-cji")->epoch;
    state=STARTING;
}
