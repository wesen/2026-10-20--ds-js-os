/* Chapter 24's fake kernel: the nw_* calls print what they are given (tools/nw_fake.c, and since
 * CJI-4 the rv32 test firmware's kernel, tools/rv32/fw/nw_main.c, so that both print the same lines). */
#ifndef NW_PRINTF   /* (CJI-4: the rv32 fake kernel, several worlds at once, prefixes each line with the world's name) */
#define NW_PRINTF printf
#endif
static int64_t t_us;
static int tokens, timers;   /* (CJI-4: timers was nw_every's own static; a kernel of several worlds keeps one each) */
void nw_log(const char *text) { NW_PRINTF("log %s\n", text); }
int64_t nw_now(void) { return t_us; }
int nw_self(char *buf, int n) { snprintf(buf, (size_t)n, "%s", getenv("NW_SELF") ? getenv("NW_SELF") : "flaky"); return (int)strlen(buf); }
int nw_send(const char *to, const char *type, const char *json) { NW_PRINTF("send %s %s %s\n", to, type, json ? json : ""); return 0; }
int nw_publish(const char *ch, const char *json) { NW_PRINTF("publish %s %s\n", ch, json ? json : ""); return 0; }
int nw_publish_retained(const char *ch, const char *json) { NW_PRINTF("publish(retained) %s %s\n", ch, json ? json : ""); return 0; }
int nw_reply(const char *json) { NW_PRINTF("reply %s\n", json ? json : "(none)"); return 0; }
int nw_reject(const char *why) { NW_PRINTF("reject %s\n", why); return 0; }
int nw_ask(const char *to, const char *type, const char *json, int ms) { NW_PRINTF("ask %s %s %s %d -> token %d\n", to, type, json ? json : "", ms, tokens + 1); return ++tokens; }
int nw_screen(const char *tree, const char *hints) { NW_PRINTF("screen %s | %s\n", tree, hints); return 0; }
int nw_need(const char *ch) { NW_PRINTF("need %s\n", ch); return 0; }
int nw_provide(const char *ch) { NW_PRINTF("provide %s\n", ch); return 0; }
int nw_every(int ms) { NW_PRINTF("every %d -> %d\n", ms, timers); return timers++; }
int nw_kind(const char *kind) { NW_PRINTF("kind %s\n", kind); return 0; }
int nw_title(const char *t) { NW_PRINTF("title %s\n", t); return 0; }
int nw_icon(const char *t) { NW_PRINTF("icon %s\n", t); return 0; }
int nw_about(const char *t) { NW_PRINTF("about %s\n", t); return 0; }
int nw_key(const char *t) { NW_PRINTF("key %s\n", t); return 0; }
int nw_sleep(int ms) { NW_PRINTF("sleep %d -> token %d\n", ms, tokens + 1); return ++tokens; }
int nw_timer(int i, int on) { NW_PRINTF("timer %d %d\n", i, on); return 0; }
int nw_store_load(char *buf, int n) { (void)n; buf[0] = 0; return 0; }
int nw_store_save(const char *json) { NW_PRINTF("store %s\n", json); return 0; }
int nw_i2c_open(const char *claim, int hz) { NW_PRINTF("i2c_open %s %d\n", claim, hz); return 1; }
int nw_i2c(int h, const unsigned char *wr, int nwr, int nrd, int gap) { NW_PRINTF("i2c %d %d bytes, read %d, gap %d -> token %d\n", h, nwr, nrd, gap, tokens + 1); (void)wr; return ++tokens; }
int nw_release(int h) { NW_PRINTF("release %d\n", h); return 0; }
int nw_error(char *buf, int n) { snprintf(buf, (size_t)n, "fake error"); return 10; }
