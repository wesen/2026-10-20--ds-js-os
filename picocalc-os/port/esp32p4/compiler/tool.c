// Private compiler program, relocated afresh for every invocation. All files
// are named buffers owned by this job. The only external services are callbacks.
#include "compiler_job.h"
#include "runtime.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <setjmp.h>

static compiler_job_t *job;
static jmp_buf escape;
extern int64_t cji_main(void), cji_error_shape[];
extern int slas_main(int, char **);
int64_t error_shape(void) { return (int64_t)(uintptr_t)cji_error_shape; }
static void failure(const char *msg);
void *malloc(size_t n) {
    void *p=job->alloc(n);
    if (n && !p) failure("compiler scratch limit");
    return p;
}
void *realloc(void *p, size_t n) {
    void *q=job->resize(p,n);
    if (n && !q) failure("compiler scratch limit");
    return q;
}
void free(void *p) { job->release(p); }
double strtod(const char *s, char **end) { return job->number(s,end); }
int _hc_vsnprintf(char *b, size_t n, const char *f, va_list a) { return job->format(b,n,f,a); }
void *_hc_load(const char *path, size_t *len) { (void)path; *len=0; return NULL; }
long _hc_write(int fd, const void *p, size_t n) {
    if (fd == 2 && !job->error[0] && n)
        snprintf(job->error,sizeof job->error,"%.*s",(int)n,(const char *)p);
    return n;
}
_Noreturn void _hc_exit(int code) { longjmp(escape,code ? code : 1); }
static void failure(const char *msg) {
    snprintf(job->error,sizeof job->error,"%s",msg);
    _hc_exit(1);
}
int clock_gettime(clockid_t clock, struct timespec *ts) {
    (void)clock;
    int64_t t=job->micros();
    ts->tv_sec=t/1000000; ts->tv_nsec=(long)(t%1000000)*1000;
    return 0;
}
struct tm *localtime_r(const time_t *t, struct tm *out) {
    (void)t; (void)out;
    failure("calendar unavailable during compilation");
    return NULL;
}
#define UNARY(f,i) double f(double x) { return job->math(i,x,0); }
#define BINARY(f,i) double f(double x,double y) { return job->math(i,x,y); }
UNARY(sin,0) UNARY(cos,1) UNARY(tan,2) UNARY(asin,3) UNARY(acos,4)
UNARY(atan,5) UNARY(sinh,6) UNARY(cosh,7) UNARY(tanh,8) UNARY(asinh,9)
UNARY(acosh,10) UNARY(atanh,11) UNARY(exp,12) UNARY(log,13) UNARY(log10,14)
UNARY(log2,15) UNARY(sqrt,16) UNARY(cbrt,17)
BINARY(atan2,18) BINARY(fmod,19) BINARY(pow,20) BINARY(hypot,21) BINARY(nextafter,22)

void compiler_entry(int argc, char **argv) {
    if (argc != 1) return;
    job=(compiler_job_t *)argv[0];
    job->status=-1;
    if (setjmp(escape)) return;
    if (fw_file_put("input.js",job->source,job->length)) failure("source allocation");
    char *args[]={"input.js","--world-unit",NULL};
    rt_argc=2; rt_argv=args; rt_fatal=failure;
    rt_heap_cap=8*1024*1024;
    rt_initialize(4*1024*1024,65536+4096);
    rootstack_end-=4096/8;
    char *slir=NULL;
    size_t size=0;
    FILE *output=open_memstream(&slir,&size);
    if (!output) failure("output allocation");
    FILE *previous=stdout;
    stdout=output;
    int status=(int)cji_main();
    fclose(output); stdout=previous;
    if (status || exc_flag) {
        snprintf(job->error,sizeof job->error,"frontend: %.160s",slir ? slir : "");
        job->status=1;
        return;
    }
    rt_free(fromspace_begin); rt_free(rootstack_begin); rt_spill_reset();
    // SLIR function headers carry scratch/saved register and frame-size fields.
    char *main=!strncmp(slir,"function main/0 ",16) ? slir : strstr(slir,"\nfunction main/0 ");
    if (main && *main=='\n') main++;
    char *start=main ? strchr(main,'\n') : NULL;
    if (!start || strncmp(start,"\nstart:\n",8)) failure("missing world entry");
    start+=8;
    FILE *linked=fopen("world.slir","w");
    if (!linked || fwrite(slir,1,start-slir,linked)!=(size_t)(start-slir) ||
        fputs("    call    $main$prelude/0\n",linked)<0 ||
        fwrite(start,1,size-(start-slir),linked)!=size-(start-slir))
        failure("link allocation");
    fclose(linked); free(slir);
    if (fw_file_put("unit.list",job->exports,job->exports_length)) failure("exports allocation");
    char *as[]={"slas","-c","world.so","--module","--extern","unit.list","world.slir",NULL};
    if (slas_main(7,as)) failure("assembly failed");
    const char *module=fw_file_get("world.so",&job->module_length);
    if (!module || !job->module_length) failure("no module");
    job->module=(unsigned char *)module; // copied before releasing all worker allocations
    job->status=0; job->error[0]=0;
}
