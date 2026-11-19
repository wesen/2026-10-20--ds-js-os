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
static bool reuse, checking;
static int64_t began;

// Include the header in the allocation limit and preserve 16-byte alignment.
typedef struct allocation {
    struct allocation *next, *prev;
    size_t size;
    uint32_t pad;
} allocation;
static allocation head = { .next=&head, .prev=&head };
static size_t held, peak;
static struct {
    const char *reason;
    size_t request, held_before, free_psram, largest_psram;
} refusal;

static void *record_refusal(const char *reason, size_t request) {
    const uint32_t caps=MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT;
    refusal.reason=reason;
    refusal.request=request;
    refusal.held_before=held;
    refusal.free_psram=heap_caps_get_free_size(caps);
    refusal.largest_psram=heap_caps_get_largest_free_block(caps);
    return NULL;
}
// The worker owns held and allocations. The kernel samples a short snapshot
// independently, so time spent inside one long compiler pass is visible.
static portMUX_TYPE progress_lock=portMUX_INITIALIZER_UNLOCKED;
typedef struct {
    const char *phase; // firmware string; remains valid after unloading the tool
    size_t scratch;
    unsigned allocations;
} progress_t;
static progress_t progress;
static unsigned allocations;
static int64_t next_report;
#define REPORT_INTERVAL_US (10LL * 1000 * 1000)

static void snapshot_progress(const char *phase) {
    portENTER_CRITICAL(&progress_lock);
    if (phase) progress.phase=phase;
    progress.scratch=held;
    progress.allocations=allocations;
    portEXIT_CRITICAL(&progress_lock);
}
static void report_progress(void) {
    portENTER_CRITICAL(&progress_lock);
    progress_t sample=progress;
    portEXIT_CRITICAL(&progress_lock);
    char line[120];
    snprintf(line,sizeof line,"cji: progress src=%02x%02x%02x%02x phase=%s elapsed_ms=%lld allocs=%u scratch=%u",
             candidate.source[0],candidate.source[1],candidate.source[2],candidate.source[3],
             sample.phase,(long long)((esp_timer_get_time()-began)/1000),
             sample.allocations,(unsigned)sample.scratch);
    kernel_log_add(port_clock(),line);
    puts(line);
}
static void enter_phase(const char *phase) {
    snapshot_progress(phase);
    report_progress();
}
static void tool_phase(compiler_phase_t phase) {
    static const char *const names[]={"frontend","link","assemble"};
    enter_phase(names[phase]);
}

static int64_t last_yield;
static void *allocate(size_t size) {
    allocations++;
    if (esp_timer_get_time()-last_yield>20000) {
        snapshot_progress(NULL);
        vTaskDelay(1);
        last_yield=esp_timer_get_time();
    }
    if (size > SCRATCH_LIMIT-sizeof(allocation) || held > SCRATCH_LIMIT-sizeof(allocation)-size)
        return record_refusal("quota",size);
    allocation *p=port_heap_malloc(sizeof(*p)+size);
    if (!p) return record_refusal("psram",size);
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
// Format before printing so other tasks cannot split a digest across log lines.
static void digest_hex(const uint8_t digest[32],char text[65]) {
    static const char digits[]="0123456789abcdef";
    for (size_t i=0;i<32;i++) {
        text[2*i]=digits[digest[i]>>4];
        text[2*i+1]=digits[digest[i]&15];
    }
    text[64]=0;
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
    peak=0;
    refusal.reason=NULL;
    // Large bundled sources need a single space before relocation divides PSRAM.
    if (job.length>SOURCE_LIMIT) job.frontend_heap_size=LARGE_FRONTEND_HEAP;
#ifdef CJI_PROFILE_GC
    if (job.profile_heap) job.frontend_heap_size=job.profile_heap;
#endif
    if (job.frontend_heap_size) {
        job.frontend_heap=allocate(job.frontend_heap_size);
        if (!job.frontend_heap) snprintf(job.error,sizeof job.error,"frontend heap reservation");
    }
    // Relocation finishes before stage 1 writes its heap. Share the reservation
    // with the decompressor so a third multi-megabyte block is unnecessary.
    tool_image=job.error[0] ? NULL : p4_bundle_read("natives/compiler.elf",&tool_size,
                                                   job.frontend_heap,job.frontend_heap_size);
    job.exports=port_read_file("compiler/unit.list",&job.exports_length);
    signal_kernel();
    // ELF relocation flushes the instruction cache with both CPUs stopped.
    // The kernel task performs that step on its internal stack.
    ulTaskNotifyTake(pdTRUE,portMAX_DELAY);
    if (!job.error[0]) {
        char *args[]={(char *)&job};
        memory_sample("relocated");
        // Once the temporary ELF image is released, claim the normal heap cap
        // in one block if possible. This avoids allocating a second GC space.
        if (!job.frontend_heap) {
            job.frontend_heap=allocate(FRONTEND_HEAP_CAP);
            if (job.frontend_heap) job.frontend_heap_size=FRONTEND_HEAP_CAP;
            else refusal.reason=NULL; // Optional reservation; use the growing heap.
        }
        printf("cji: frontend reserved_bytes=%u\n",(unsigned)job.frontend_heap_size);
        esp_elf_request(&tool,0,1,args);
#ifdef CJI_PROFILE_GC
        if (job.profile_started) {
            printf("cji: metrics complete=%d frontend_us=%lld gc_us=%lld collections=%lld live_peak_bytes=%lld survivor_bytes=%lld slide_bytes=%lld\n",
                   job.profile_complete, (long long)job.frontend_us, (long long)job.gc_us,
                   (long long)job.collections, (long long)job.live_peak, (long long)job.survivor_bytes,
                   (long long)job.slide_bytes);
        }
#endif
        memory_sample(job.status ? "compiler refused" : "assembled");
        if (!job.status && checking) {
            if (!digest(job.module,job.module_length,candidate.artifact)) {
                job.status=-1;
                snprintf(job.error,sizeof job.error,"module digest failed");
            }
        } else if (!job.status && job.module_length<=MODULE_LIMIT) {
            output=malloc(job.module_length);
            if (output) { output_size=job.module_length; memcpy(output,job.module,output_size); }
        }
        if (!checking && !job.status && !output) snprintf(job.error,sizeof job.error,"module size or allocation");
    }
    if (refusal.reason) {
        printf("cji: allocation refused reason=%s request=%u header=%u held=%u limit=%u psram_free=%u psram_largest=%u\n",
               refusal.reason,(unsigned)refusal.request,(unsigned)sizeof(allocation),
               (unsigned)refusal.held_before,(unsigned)SCRATCH_LIMIT,
               (unsigned)refusal.free_psram,(unsigned)refusal.largest_psram);
    }
    esp_elf_deinit(&tool);
    free((void *)job.exports);
    while (head.next!=&head) release(head.next+1);
    enter_phase(job.status ? "failed" : "assembled");
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
static void begin(char *source,size_t len,bool automatic,bool check_only,size_t profile_heap) {
    checking=check_only;
    memset(&candidate,0,sizeof candidate);
    candidate.version=1; candidate.slot=active.version ? !active.slot : 0;
    candidate.engine=ENG_NATIVE; candidate.automatic=automatic;
    memcpy(candidate.firmware,esp_app_get_description()->app_elf_sha256,32);
    if (!digest(source,len,candidate.source)) { free(source); puts("cji: hash failed"); return; }
    job=(compiler_job_t){.source=source,.length=len,.alloc=allocate,.resize=resize,.release=release,
        .format=vsnprintf,.number=strtod,.math=compiler_math,.micros=esp_timer_get_time,.phase=tool_phase,.status=-1};
#ifdef CJI_PROFILE_GC
    job.profile_heap=profile_heap;
#else
    (void)profile_heap;
#endif
    began=esp_timer_get_time();
    reuse=!checking && active.version && active.automatic==automatic &&
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
    allocations=0;
    next_report=began+REPORT_INTERVAL_US;
    enter_phase("load");
    state=LOADING;
    xTaskNotifyGive(worker);
    puts("cji: compiling source on device");
}
void compiler_console(const char *command) {
    if (!strcmp(command,"status")) {
        if (!reuse && (state==LOADING || state==BUILDING)) report_progress();
        else puts(state==READY ? "cji: idle" : "cji: activating");
        return;
    }
    if (state!=READY) { puts("cji: busy"); return; }
    const char *path=strchr(command,' ');
    size_t profile_heap=0;
#ifdef CJI_PROFILE_GC
    if (!strncmp(command,"profile ",8)) {
        const char *arg=command+8;
        if (!strncmp(arg,"8 ",2)) { profile_heap=FRONTEND_HEAP_CAP; path=arg+1; }
        else if (!strncmp(arg,"10 ",3)) { profile_heap=LARGE_FRONTEND_HEAP; path=arg+2; }
        else { puts("cji: expected profile 8|10 BUNDLED.js"); return; }
    }
#endif
    if (profile_heap || !strncmp(command,"check ",6)) {
        const char *file=path+1;
        size_t n=strlen(file), len=0;
        char *source=n>3 && !strcmp(file+n-3,".js") && fs_path_ok(file) ? port_read_file(file,&len) : NULL;
        if (!source) { puts("cji: bundled JS source unavailable"); return; }
        begin(source,len,false,true,profile_heap);
        return;
    }
    bool automatic=!strncmp(command,"install ",8);
    if (!path || (!automatic && strncmp(command,"build ",6)) || !fs_path_ok(++path)) {
        puts("cji build PATH | cji install PATH | cji check BUNDLED.js | cji status"); return;
    }
    char full[FS_PATH_MAX+8];
    snprintf(full,sizeof full,"/files/%s",path);
    size_t len=0;
    char *source=read_bounded_file(full,SOURCE_LIMIT,&len);
    if (!source || memchr(source,0,len)) { free(source); puts("cji: expected bounded JavaScript source"); return; }
    begin(source,len,automatic,false,0);
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
    begin(src,n,active.automatic,false,0);
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
void compiler_tick(bool defer_relocation) {
    if ((state==LOADING || state==BUILDING) && !reuse) {
        int64_t now=esp_timer_get_time();
        if (now>=next_report) {
            next_report=now+REPORT_INTERVAL_US;
            report_progress();
        }
    }
    world_t *w=world_by_name("dev-cji");
    if (state==STARTING) {
        if (!w || w->epoch!=candidate_epoch || w->last_error[0]) { puts("cji: candidate failed during boot"); rollback(); return; }
        if (w->boot_ready || w->status!=W_IDLE || w->in_turn || (w->has_start && w->mbox)) return;
        if (!reuse && port_store_set("k","cji-installed",&candidate,sizeof candidate)) {
            puts("cji: install record commit failed"); rollback(); return;
        }
        active=candidate;
        char hash[65];
        digest_hex(active.artifact,hash);
        printf("cji: artifact %u bytes sha256=%s\n",(unsigned)output_size,hash);
        printf("cji: ready dev-cji engine=%s cache=%s elapsed_ms=%lld scratch_peak=%u\n",
            candidate.engine==ENG_JS ? "js":"native",reuse ? "hit":"miss",
            (long long)((esp_timer_get_time()-began)/1000),(unsigned)(reuse ? 0:peak));
        cleanup(); return;
    }
    int done;
    if (state==LOADING) {
        if (defer_relocation) return;
        if (xQueueReceive(finished,&done,0)!=pdTRUE) return;
        esp_elf_init(&tool);
        if (!tool_image || !job.exports) {
            if (!job.error[0]) snprintf(job.error,sizeof job.error,"compiler bundle allocation");
        } else {
#if PICOCALC_TYPED_AGENDA
            vtime_t relocation_start = port_clock();
#endif
            int rc=esp_elf_relocate(&tool,(const uint8_t *)tool_image,tool_size);
#if PICOCALC_TYPED_AGENDA
            printf("cji: loader start_us=%lld end_us=%lld\n",
                   (long long)relocation_start, (long long)port_clock());
#endif
            if (rc) snprintf(job.error,sizeof job.error,"compiler relocation %d",rc);
        }
        if (!job.frontend_heap) free(tool_image);
        tool_image=NULL;
        state=BUILDING;
        xTaskNotifyGive(worker);
        return;
    }
    if (state!=BUILDING) return;
    if (!reuse && xQueueReceive(finished,&done,0)!=pdTRUE) return;
    if (checking) {
        char source_hash[65],detail[sizeof job.error+8];
        digest_hex(candidate.source,source_hash);
        if (job.status) snprintf(detail,sizeof detail,"error=%s",job.error);
        else {
            char module_hash[65];
            digest_hex(candidate.artifact,module_hash);
            snprintf(detail,sizeof detail,"bytes=%u sha256=%s",(unsigned)job.module_length,module_hash);
        }
        printf("cji: check %s elapsed_ms=%lld scratch_peak=%u source_sha256=%s %s\n",
               job.status ? "failed" : "ok",(long long)((esp_timer_get_time()-began)/1000),
               (unsigned)peak,source_hash,detail);
        cleanup();
        return;
    }
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
