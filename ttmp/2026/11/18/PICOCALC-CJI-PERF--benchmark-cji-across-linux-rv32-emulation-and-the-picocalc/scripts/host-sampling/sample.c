/* Linux x86-64, single-threaded stage 1. Descriptor 3 receives sampled instruction addresses. */
#define _GNU_SOURCE
#include <stdint.h>
#include <signal.h>
#include <stdlib.h>
#include <sys/time.h>
#include <ucontext.h>
#include <unistd.h>
#include <errno.h>

static uintptr_t pcs[256 * 1024];
static volatile sig_atomic_t count, overflow;

static void record(int sig, siginfo_t *info, void *context) {
    (void)sig;
    (void)info;
    if (count == (sig_atomic_t)(sizeof(pcs) / sizeof(pcs[0]))) { overflow = 1; return; }
    pcs[count++] = ((ucontext_t *)context)->uc_mcontext.gregs[REG_RIP];
}

__attribute__((constructor)) static void start(void) {
    struct sigaction action = {.sa_sigaction = record, .sa_flags = SA_SIGINFO | SA_RESTART};
    struct itimerval timer = {.it_value={0,1000}, .it_interval={0,1000}};
    sigemptyset(&action.sa_mask);
    if (sigaction(SIGPROF, &action, NULL) || setitimer(ITIMER_PROF, &timer, NULL)) _exit(2);
}

__attribute__((destructor)) static void finish(void) {
    struct itimerval stop = {0};
    sigset_t signals;
    sigemptyset(&signals);
    sigaddset(&signals, SIGPROF);
    if (sigprocmask(SIG_BLOCK, &signals, NULL) || setitimer(ITIMER_PROF, &stop, NULL) || overflow) _exit(2);
    const char *p = (const char *)pcs;
    size_t bytes = (size_t)count * sizeof(pcs[0]);
    while (bytes) {
        ssize_t n = write(3, p, bytes);
        if (n < 0 && errno == EINTR) continue;
        if (n <= 0) _exit(2);
        p += n;
        bytes -= n;
    }
}
