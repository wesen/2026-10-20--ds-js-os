// Native worlds on the Linux host: each one is a child process, isolated by what the hardware and Linux give.
//   - its own address space (the MMU): it cannot address picocalc-os at all;
//   - one descriptor, 3, a SOCK_SEQPACKET socket to the kernel (sdk/nw_wire.h); 0-2 are /dev/null;
//   - a seccomp filter, installed here before the exec so the binary cannot skip it: read and write on descriptor 3,
//     memory management, the clock, and what a static C or C++ runtime needs to start; anything that reaches outside
//     the process (files, sockets, other processes, exec) kills it;
//   - resource limits: its data segment and anonymous mappings at mem_kb, no files, no core dumps;
//   - time: while a turn runs the kernel waits for its answer until the turn budget is spent, then kills it.
// The binary is the manifest file's bytes (the kernel read them); it is run from a memfd, so the child opens no
// file, and it must be statically linked (a dynamic loader would try to open libraries and be killed).
#include <errno.h>
#include <fcntl.h>
#include <linux/audit.h>
#include <linux/filter.h>
#include <linux/seccomp.h>
#include <poll.h>
#include <signal.h>
#include <stddef.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/prctl.h>
#include <sys/resource.h>
#include <sys/socket.h>
#include <sys/syscall.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>
#include "../nucleus/nucleus.h"
#include "../sdk/nw_wire.h"

_Static_assert((int)NW_CALL_LOG == (int)NW_LOG && (int)NW_CALL_TIMER == (int)NW_TIMER && (int)NW_CALL_COUNT == (int)NW_CALLS, "sdk/nw_wire.h and nucleus.h number the system calls alike");
_Static_assert(NW_WIRE_INIT == (int)NW_INIT, "the init event's kind");
_Static_assert(NW_WIRE_STR_MAX == NW_STR_MAX, "the longest string");

typedef struct { pid_t pid; int fd; unsigned char *buf; bool dead; int status; } proc_t;

static vtime_t mono_us(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return (vtime_t)t.tv_sec * 1000000 + t.tv_nsec / 1000; }

// ---- the seccomp filter ----------------------------------------------------------------------------------------
// Built for the child after fork, with its own pid, so that abort() can signal itself and nothing else. Three outcomes:
//   allow     the socket (descriptor 3), memory, the clock, signals to itself, and what a static runtime starts with;
//   an error  calls a C library makes on its own and that reach nothing: reading the path of /proc/self/exe at start,
//             stdio's fstat and ioctl on standard output, reading or writing any descriptor but 3 (printf goes nowhere);
//   kill      everything else: opening files, sockets, processes, signals to others, exec of any file but its own.
static int install_filter(pid_t self) {
#if defined(__x86_64__)
  struct sock_filter f[160];
  int n = 0;
#define S(code, k) (f[n++] = (struct sock_filter)BPF_STMT(code, k))
#define J(code, k, jt, jf) (f[n++] = (struct sock_filter)BPF_JUMP(code, k, jt, jf))
#define LD(off) S(BPF_LD | BPF_W | BPF_ABS, (uint32_t)(off))
#define RET(v) S(BPF_RET | BPF_K, (v))
#define KILL RET(SECCOMP_RET_KILL_PROCESS)
#define ERR(e) (SECCOMP_RET_ERRNO | ((e) & SECCOMP_RET_DATA))
// for nr: allow if args[0] (all 64 bits) is v, else return `other`. 6 instructions follow the test, which leaves
// the accumulator holding nr when it does not match.
#define IF_ARG0(nr, v, other) (J(BPF_JMP | BPF_JEQ | BPF_K, nr, 0, 6), LD(offsetof(struct seccomp_data, args[0])), \
    J(BPF_JMP | BPF_JEQ | BPF_K, (uint32_t)(v), 0, 3), LD(offsetof(struct seccomp_data, args[0]) + 4), \
    J(BPF_JMP | BPF_JEQ | BPF_K, 0, 0, 1), RET(SECCOMP_RET_ALLOW), RET(other))
#define ON(nr, v) (J(BPF_JMP | BPF_JEQ | BPF_K, nr, 0, 1), RET(v))
  LD(offsetof(struct seccomp_data, arch));
  J(BPF_JMP | BPF_JEQ | BPF_K, AUDIT_ARCH_X86_64, 1, 0);
  KILL;
  LD(offsetof(struct seccomp_data, nr));
  J(BPF_JMP | BPF_JGE | BPF_K, 0x40000000, 0, 1);   // the x32 ABI
  KILL;
  IF_ARG0(__NR_read, 3, ERR(EBADF));
  IF_ARG0(__NR_write, 3, ERR(EBADF));
  IF_ARG0(__NR_kill, self, SECCOMP_RET_KILL_PROCESS);       // abort() and raise() signal the process itself
  IF_ARG0(__NR_tgkill, self, SECCOMP_RET_KILL_PROCESS);
  IF_ARG0(__NR_prlimit64, 0, SECCOMP_RET_KILL_PROCESS);     // its own limits only (the runtime reads RLIMIT_STACK)
  IF_ARG0(__NR_execveat, 4, SECCOMP_RET_KILL_PROCESS);      // the exec of the memfd, which the exec closes
  IF_ARG0(__NR_prctl, PR_SET_DUMPABLE, SECCOMP_RET_KILL_PROCESS);   // sdk/nw_proc.c turns core dumps off
  ON(__NR_readlink, ERR(ENOENT));
  ON(__NR_readlinkat, ERR(ENOENT));
  ON(__NR_fstat, ERR(EBADF));
  ON(__NR_newfstatat, ERR(EBADF));
  ON(__NR_lseek, ERR(EBADF));
  ON(__NR_ioctl, ERR(ENOTTY));
  static const int ok[] = {
    __NR_brk, __NR_mmap, __NR_munmap, __NR_mremap, __NR_mprotect, __NR_madvise,
    __NR_exit, __NR_exit_group, __NR_rt_sigreturn, __NR_rt_sigprocmask, __NR_rt_sigaction,
    __NR_clock_gettime, __NR_clock_getres, __NR_gettimeofday, __NR_getrandom,
    __NR_arch_prctl, __NR_set_tid_address, __NR_set_robust_list, __NR_rseq,
    __NR_futex, __NR_sched_yield, __NR_getpid, __NR_gettid,
  };
  for (size_t i = 0; i < sizeof ok / sizeof ok[0]; i++) ON(ok[i], SECCOMP_RET_ALLOW);
  KILL;
#undef S
#undef J
#undef LD
#undef RET
#undef KILL
#undef ERR
#undef IF_ARG0
#undef ON
  struct sock_fprog prog = { .len = (unsigned short)n, .filter = f };
  if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0)) return -1;
  return prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, &prog);
#else
  (void)self;
  return -1;   // a filter for other architectures is not written yet: refuse to run binaries unconfined
#endif
}

// ---- the child -------------------------------------------------------------------------------------------------
static void child(int sock, int mfd, size_t mem_limit, const char *name) {
  if (dup2(mfd, 4) < 0 || fcntl(4, F_SETFD, FD_CLOEXEC) < 0) _exit(126);   // the binary, closed by the exec
  if (dup2(sock, 3) < 0) _exit(126);
  int null = open("/dev/null", O_RDWR);
  if (null < 0 || dup2(null, 0) < 0 || dup2(null, 1) < 0 || dup2(null, 2) < 0) _exit(126);
  syscall(SYS_close_range, 5u, ~0u, 0u);
  struct rlimit data = { mem_limit + 512 * 1024, mem_limit + 512 * 1024 };   // its heap, plus a static runtime's own data
  struct rlimit as = { mem_limit + 64u * 1024 * 1024, mem_limit + 64u * 1024 * 1024 };   // code, stack and the rest
  struct rlimit zero = { 0, 0 }, files = { 5, 5 }, stack = { 1024 * 1024, 1024 * 1024 };
  if (setrlimit(RLIMIT_DATA, &data) || setrlimit(RLIMIT_AS, &as) || setrlimit(RLIMIT_FSIZE, &zero) ||
      setrlimit(RLIMIT_CORE, &zero) || setrlimit(RLIMIT_NOFILE, &files) || setrlimit(RLIMIT_STACK, &stack)) _exit(126);
  prctl(PR_SET_PDEATHSIG, SIGKILL);
  if (install_filter(getpid())) _exit(125);
  char *argv[] = { (char *)name, NULL }, *envp[] = { NULL };
  syscall(SYS_execveat, 4, "", argv, envp, AT_EMPTY_PATH);
  _exit(127);
}

// How a child ended, in words for the crash report.
static void describe(proc_t *p, char *why, size_t n) {
  if (!p->dead) { waitpid(p->pid, &p->status, 0); p->dead = true; }
  int st = p->status;
  if (WIFEXITED(st)) {
    int c = WEXITSTATUS(st);
    snprintf(why, n, c == 125 ? "the sandbox could not be set up" : c == 126 ? "the process could not be prepared" :
             c == 127 ? "the binary could not be started (not a static executable for this machine?)" : "it exited with status %d", c);
  } else if (WIFSIGNALED(st)) {
    int s = WTERMSIG(st);
    if (s == SIGSYS) snprintf(why, n, "the sandbox stopped it: it made a system call native worlds may not make");
    else if (s == SIGSEGV) snprintf(why, n, "segmentation fault (an access outside its memory)");
    else snprintf(why, n, "it was killed by signal %d (%s)", s, strsignal(s));
  } else snprintf(why, n, "it stopped");
}

static void reap(proc_t *p) {
  if (!p->dead) { kill(p->pid, SIGKILL); waitpid(p->pid, &p->status, 0); p->dead = true; }
}

// ---- the backend -------------------------------------------------------------------------------------------------
static int proc_load(world_t *W, char *why, size_t n) {
  if (W->source_len < 4 || memcmp(W->source, "\177ELF", 4)) { snprintf(why, n, "%s is not an executable (no ELF header)", W->file); return -1; }
  int sv[2];
  if (socketpair(AF_UNIX, SOCK_SEQPACKET | SOCK_CLOEXEC, 0, sv)) { snprintf(why, n, "socketpair: %s", strerror(errno)); return -1; }
  int mfd = memfd_create(W->name, MFD_CLOEXEC);
  if (mfd < 0) { close(sv[0]); close(sv[1]); snprintf(why, n, "memfd_create: %s", strerror(errno)); return -1; }
  for (size_t off = 0; off < W->source_len;) {
    ssize_t k = write(mfd, W->source + off, W->source_len - off);
    if (k <= 0) { close(mfd); close(sv[0]); close(sv[1]); snprintf(why, n, "memfd: %s", strerror(errno)); return -1; }
    off += (size_t)k;
  }
  fflush(NULL);   // nothing buffered in this process may be written twice by the child
  pid_t pid = fork();
  if (pid < 0) { close(mfd); close(sv[0]); close(sv[1]); snprintf(why, n, "fork: %s", strerror(errno)); return -1; }
  if (pid == 0) child(sv[1], mfd, W->mem_limit, W->name);
  close(sv[1]); close(mfd);
  proc_t *p = calloc(1, sizeof *p);
  p->pid = pid; p->fd = sv[0];
  p->buf = malloc(NW_FRAME_MAX);
  W->nat->inst = p;
  return 0;
}

static void proc_unload(world_t *W) {
  proc_t *p = W->nat->inst;
  if (!p) return;
  close(p->fd);
  reap(p);
  free(p->buf);
  free(p);
  W->nat->inst = NULL;
}

static bool send_frame(proc_t *p, uint32_t op, int32_t a, int32_t b, int32_t c, int64_t v,
                       const char *s0, size_t n0, const char *s1, size_t n1, const char *s2, size_t n2) {
  nw_frame_t *f = (nw_frame_t *)p->buf;
  const char *s[3] = { s0, s1, s2 };
  size_t ln[3] = { n0, n1, n2 };
  memset(f, 0, sizeof *f);
  f->magic = NW_WIRE_MAGIC; f->op = op; f->i[0] = a; f->i[1] = b; f->i[2] = c; f->v = v;
  unsigned char *q = p->buf + sizeof *f;
  for (int k = 0; k < 3; k++) {
    if (ln[k] > NW_WIRE_STR_MAX) ln[k] = NW_WIRE_STR_MAX;
    f->n[k] = (uint32_t)ln[k];
    if (ln[k]) memcpy(q, s[k], ln[k]);
    q += ln[k];
  }
  ssize_t len = q - p->buf;
  return send(p->fd, p->buf, (size_t)len, MSG_NOSIGNAL) == len;
}

static void mem_used(world_t *W, proc_t *p) {
  char path[64]; snprintf(path, sizeof path, "/proc/%d/statm", (int)p->pid);
  FILE *f = fopen(path, "r");
  long size, rss;
  if (f && fscanf(f, "%ld %ld", &size, &rss) == 2) W->mem_used = (size_t)((double)rss * sysconf(_SC_PAGESIZE) * PROFILE.mem_scale);
  if (f) fclose(f);
}

static int proc_event(world_t *W, const nw_event_t *e) {
  proc_t *p = W->nat->inst;
  vtime_t start = mono_us(), last = start, deadline = start + W->nat->budget_us;
  int second = e->kind == NW_SETTLE ? e->ok : e->ask;
  if (!send_frame(p, NW_F_EVENT, e->kind, second, e->timer, e->token, e->type, e->type_len, e->json, e->json_len, e->from, e->from_len)) {
    describe(p, W->last_error, sizeof W->last_error);
    return -1;
  }
  static char out[NW_OUT_MAX];
  for (;;) {
    vtime_t now = mono_us();
    K.seg_cost += now - last; last = now;   // on the virtual clock, the time the child took
    int left_ms = (int)((deadline - now + 999) / 1000);
    struct pollfd pf = { .fd = p->fd, .events = POLLIN };
    int r = left_ms > 0 ? poll(&pf, 1, left_ms) : 0;
    if (r < 0 && errno == EINTR) continue;
    if (r == 0) { reap(p); W->overrun = true; K.seg_cost += mono_us() - last; return -1; }
    ssize_t got = recv(p->fd, p->buf, NW_FRAME_MAX, 0);
    now = mono_us(); K.seg_cost += now - last; last = now;
    if (got <= 0) { describe(p, W->last_error, sizeof W->last_error); return -1; }
    nw_frame_t *f = (nw_frame_t *)p->buf;
    if ((size_t)got < sizeof *f || f->magic != NW_WIRE_MAGIC || f->n[0] > NW_WIRE_STR_MAX || f->n[1] > NW_WIRE_STR_MAX ||
        f->n[2] > NW_WIRE_STR_MAX || (size_t)got != sizeof *f + (size_t)f->n[0] + f->n[1] + f->n[2]) {
      reap(p);
      snprintf(W->last_error, sizeof W->last_error, "it broke the native protocol (a malformed frame)");
      return -1;
    }
    if (f->op == NW_F_END) {
      mem_used(W, p);
      if (f->i[0] != NW_DONE && f->i[0] != NW_LATER) { reap(p); snprintf(W->last_error, sizeof W->last_error, "it broke the native protocol (an end of %d)", f->i[0]); return -1; }
      return f->i[0];
    }
    if (f->op != NW_F_CALL) { reap(p); snprintf(W->last_error, sizeof W->last_error, "it broke the native protocol (frame %u)", f->op); return -1; }
    const char *s = (const char *)(p->buf + sizeof *f);
    nw_call_t c = { .op = f->i[0], .i = { f->i[1], f->i[2], (int32_t)f->v }, .v = f->v,
                    .s = { s, s + f->n[0], s + f->n[0] + f->n[1] }, .n = { f->n[0], f->n[1], f->n[2] } };
    int64_t res = nat_syscall(W, &c, out, sizeof out);
    const char *text = res < 0 ? W->nat->err : out;
    if (!send_frame(p, NW_F_RESULT, 0, 0, 0, res, text, strlen(text), NULL, 0, NULL, 0)) {
      describe(p, W->last_error, sizeof W->last_error);
      return -1;
    }
  }
}

static const native_backend_t PROC = { "proc", proc_load, proc_event, proc_unload };
const native_backend_t *port_native_backend(int engine) { return engine == ENG_NATIVE ? &PROC : NULL; }
