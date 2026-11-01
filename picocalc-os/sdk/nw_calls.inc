// The system calls as the C functions of nw.h, for a runtime that defines, before including this file:
//   static int64_t call(int op, int a, int b, int64_t c, const char *s0, size_t n0, const char *s1, size_t n1,
//                       const char *s2, size_t n2, char *out, int out_n);
//     one system call, numbered as in nw_wire.h; its text result goes to out (at most out_n - 1 bytes and a NUL)
//   static char last_err[256];   why the last call that failed failed
// sdk/nw_proc.c (a host process: call is a frame on the socket) and sdk/nw_wasm.c (WebAssembly: call is an import).
#define S(x) (x), ((x) ? strlen(x) : 0)
#define NONE NULL, 0

void nw_log(const char *text) { call(NW_CALL_LOG, 0, 0, 0, S(text), NONE, NONE, NULL, 0); }
int64_t nw_now(void) { return call(NW_CALL_NOW, 0, 0, 0, NONE, NONE, NONE, NULL, 0); }
int nw_self(char *buf, int n) { return (int)call(NW_CALL_SELF, 0, 0, 0, NONE, NONE, NONE, buf, n); }
int nw_send(const char *to, const char *type, const char *json) { return (int)call(NW_CALL_SEND, 0, 0, 0, S(to), S(type), S(json), NULL, 0); }
int nw_publish(const char *ch, const char *json) { return (int)call(NW_CALL_PUBLISH, 0, 0, 0, S(ch), S(json), NONE, NULL, 0); }
int nw_reply(const char *json) { return (int)call(NW_CALL_REPLY, 0, 0, 0, S(json), NONE, NONE, NULL, 0); }
int nw_reject(const char *why) { return (int)call(NW_CALL_REJECT, 0, 0, 0, S(why), NONE, NONE, NULL, 0); }
int nw_ask(const char *to, const char *type, const char *json, int timeout_ms) {
  return (int)call(NW_CALL_ASK, timeout_ms, 0, 0, S(to), S(type), S(json), NULL, 0);
}
int nw_need(const char *ch) { return (int)call(NW_CALL_NEED, 0, 0, 0, S(ch), NONE, NONE, NULL, 0); }
int nw_provide(const char *ch) { return (int)call(NW_CALL_PROVIDE, 0, 0, 0, S(ch), NONE, NONE, NULL, 0); }
int nw_every(int ms) { return (int)call(NW_CALL_EVERY, ms, 0, 0, NONE, NONE, NONE, NULL, 0); }
int nw_kind(const char *kind) { return (int)call(NW_CALL_KIND, 0, 0, 0, S(kind), NONE, NONE, NULL, 0); }
int nw_sleep(int ms) { return (int)call(NW_CALL_SLEEP, ms, 0, 0, NONE, NONE, NONE, NULL, 0); }
int nw_timer(int index, int on) { return (int)call(NW_CALL_TIMER, index, on, 0, NONE, NONE, NONE, NULL, 0); }
int nw_store_load(char *buf, int n) { return (int)call(NW_CALL_STORE_LOAD, 0, 0, 0, NONE, NONE, NONE, buf, n); }
int nw_store_save(const char *json) { return (int)call(NW_CALL_STORE_SAVE, 0, 0, 0, S(json), NONE, NONE, NULL, 0); }
int nw_i2c_open(const char *claim, int hz) { return (int)call(NW_CALL_I2C_OPEN, hz, 0, 0, S(claim), NONE, NONE, NULL, 0); }
int nw_i2c(int handle, const unsigned char *wr, int nwr, int nrd, int gap_ms) {
  return (int)call(NW_CALL_I2C, handle, nrd, (int64_t)gap_ms * 1000, (const char *)wr, nwr > 0 ? (size_t)nwr : 0, NONE, NONE, NULL, 0);
}
int nw_release(int handle) { return (int)call(NW_CALL_RELEASE, handle, 0, 0, NONE, NONE, NONE, NULL, 0); }
int nw_error(char *buf, int n) {
  if (n <= 0) return 0;
  size_t k = strlen(last_err);
  if (k > (size_t)n - 1) k = (size_t)n - 1;
  memcpy(buf, last_err, k); buf[k] = 0;
  return (int)k;
}

