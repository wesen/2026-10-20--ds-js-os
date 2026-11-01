// The runtime of a native world that runs as a host process. picocalc-os starts the binary with descriptor 3, a
// SOCK_SEQPACKET socket, as its only way out: a seccomp filter allows reading and writing it and nothing else that
// reaches outside the process. main() reads events from it and calls the module's handlers; every nw_* call sends
// a CALL frame and waits for the RESULT. Link it with the module, statically: gcc -static mod.c sdk/nw_proc.c
#include <string.h>
#include <sys/prctl.h>
#include <unistd.h>
#include "nw.h"
#include "nw_wire.h"

#define FD 3
static unsigned char rx[NW_FRAME_MAX], tx[NW_FRAME_MAX];
static char ev[3 * NW_WIRE_STR_MAX + 3];   // the current event's strings, kept while its handler makes calls
static char last_err[256];

static void die(void) { _exit(3); }

// No core dump when the sandbox or a fault kills the process. The system's core handler (apport, systemd-coredump)
// would hold the dying process for 100 ms or more, and the kernel would see a turn that overran its budget instead
// of the real reason. This runs before the module's own constructors.
__attribute__((constructor(101))) static void no_core_dump(void) { prctl(PR_SET_DUMPABLE, 0, 0, 0, 0); }   // the kernel went away or broke the protocol

static void send_frame(uint32_t op, int32_t a, int32_t b, int32_t c, int64_t v,
                       const void *s0, size_t n0, const void *s1, size_t n1, const void *s2, size_t n2) {
  nw_frame_t *f = (nw_frame_t *)tx;
  const void *s[3] = { s0, s1, s2 };
  size_t n[3] = { n0, n1, n2 };
  memset(f, 0, sizeof *f);
  f->magic = NW_WIRE_MAGIC; f->op = op; f->i[0] = a; f->i[1] = b; f->i[2] = c; f->v = v;
  unsigned char *p = tx + sizeof *f;
  for (int k = 0; k < 3; k++) {
    if (n[k] > NW_WIRE_STR_MAX) n[k] = NW_WIRE_STR_MAX;
    f->n[k] = (uint32_t)n[k];
    if (n[k]) memcpy(p, s[k], n[k]);
    p += n[k];
  }
  ssize_t len = p - tx;
  if (write(FD, tx, (size_t)len) != len) die();
}

static nw_frame_t *recv_frame(uint32_t want) {
  ssize_t got = read(FD, rx, sizeof rx);
  if (got == 0 && want == NW_F_EVENT) _exit(0);   // the kernel closed the socket: the world is being stopped
  if (got < (ssize_t)sizeof(nw_frame_t)) die();
  nw_frame_t *f = (nw_frame_t *)rx;
  if (f->magic != NW_WIRE_MAGIC || f->op != want) die();
  if ((size_t)got != sizeof *f + (size_t)f->n[0] + f->n[1] + f->n[2]) die();
  return f;
}

static int64_t call(int op, int a, int b, int64_t c, const char *s0, size_t n0, const char *s1, size_t n1,
                    const char *s2, size_t n2, char *out, int out_n) {
  send_frame(NW_F_CALL, op, a, b, c, s0, n0, s1, n1, s2, n2);
  nw_frame_t *f = recv_frame(NW_F_RESULT);
  const char *text = (const char *)(rx + sizeof *f);
  size_t tn = f->n[0];
  if (f->v < 0) {
    size_t k = tn < sizeof last_err - 1 ? tn : sizeof last_err - 1;
    memcpy(last_err, text, k); last_err[k] = 0;
  } else if (out && out_n > 0) {
    size_t k = tn < (size_t)out_n - 1 ? tn : (size_t)out_n - 1;
    memcpy(out, text, k); out[k] = 0;
  }
  return f->v;
}
#include "nw_calls.inc"

int main(void) {
  for (;;) {
    nw_frame_t *f = recv_frame(NW_F_EVENT);
    const char *src = (const char *)(rx + sizeof *f);
    char *dst = ev, *str[3];
    for (int k = 0; k < 3; k++) {   // NUL-terminated copies: the receive buffer is reused by the handler's calls
      str[k] = dst;
      memcpy(dst, src, f->n[k]); dst[f->n[k]] = 0;
      src += f->n[k]; dst += f->n[k] + 1;
    }
    nw_event e = { 0 };
    e.kind = f->i[0];
    e.type = str[0]; e.json = str[1]; e.json_len = (int)f->n[1]; e.from = str[2];
    e.ask = e.kind == NW_MESSAGE ? f->i[1] : 0;
    e.ok = e.kind == NW_SETTLE ? f->i[1] : 0;
    e.timer = f->i[2];
    e.token = (int)f->v;
    int r = NW_DONE;
    if (e.kind == NW_WIRE_INIT) nw_init();
    else r = nw_on_event(&e) == NW_LATER ? NW_LATER : NW_DONE;
    send_frame(NW_F_END, r, 0, 0, 0, NONE, NONE, NONE);
  }
}
