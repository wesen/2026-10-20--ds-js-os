// echo: a native world that exercises every system call, for tests/test_native_worlds.py. Each message type is one
// case; results are logged as "TEST <label> <result>" lines, as the JavaScript test worlds do.
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "nw.h"
#include "nw_json.h"

static int ticks, tick_timer = -1, sleep_token, ask_token, i2c_token;
static char buf[4096];
static void *held[16];   // the "alloc" ask's blocks
static int n_held, held_kb;

static void report(const char *label, int r) {
  char err[200] = "";
  if (r < 0) nw_error(err, sizeof err);
  snprintf(buf, sizeof buf, "TEST %s %s %s", label, r < 0 ? "err" : "ok", r < 0 ? err : "");
  nw_log(buf);
}

void nw_init(void) {
  report("kind", nw_kind("service"));
  report("provide", nw_provide("echo.out"));
  tick_timer = nw_every(50);
  report("every", tick_timer);
  nw_log("TEST init done");
}

int nw_on_event(const nw_event *e) {
  if (e->kind == NW_START) {
    char me[32];
    nw_self(me, sizeof me);
    snprintf(buf, sizeof buf, "TEST start self=%s clock=%s", me, nw_now() > 0 ? "running" : "zero");
    nw_log(buf);
    return NW_DONE;
  }
  if (e->kind == NW_TICK) {
    if (++ticks == 3) {
      nw_timer(e->timer, 0);
      snprintf(buf, sizeof buf, "TEST ticks %d timer=%d", ticks, e->timer);
      nw_log(buf);
    }
    return NW_DONE;
  }
  if (e->kind == NW_SETTLE) {
    if (e->token == sleep_token) { nw_reply("\"slept\""); return NW_DONE; }
    if (e->token == ask_token) {
      snprintf(buf, sizeof buf, "{\"ok\":%s,\"answer\":%s}", e->ok ? "true" : "false", e->json);
      nw_reply(buf);
      return NW_DONE;
    }
    if (e->token == i2c_token) {
      unsigned char rd[8];
      int n = nw_json_bytes(e->json, rd, sizeof rd);
      snprintf(buf, sizeof buf, "{\"n\":%d,\"reg\":%d,\"value\":%d}", n, n > 0 ? rd[0] : -1, n > 1 ? rd[1] : -1);
      nw_reply(buf);
      return NW_DONE;
    }
    return NW_DONE;
  }
  if (e->kind != NW_MESSAGE) return NW_DONE;
  const char *t = e->type;
  if (!strcmp(t, "ping")) {
    snprintf(buf, sizeof buf, "{\"pong\":%s,\"from\":\"%s\",\"ask\":%d}", e->json, e->from, e->ask);
    nw_reply(buf);
  } else if (!strcmp(t, "later")) {
    sleep_token = nw_sleep(30);
    return NW_LATER;
  } else if (!strcmp(t, "refuse")) {
    nw_reject("echo refuses");
  } else if (!strcmp(t, "bad-json")) {
    report("bad-reply", nw_reply("{not json"));
    report("handle-forgery", nw_reply("{\"$h\":1}"));
    report("bad-send", nw_send("peer", "x", "[1,2"));
    nw_reply("\"fixed\"");
  } else if (!strcmp(t, "publish")) {
    report("publish", nw_publish("echo.out", e->json));
    report("publish-undeclared", nw_publish("elsewhere", "1"));
  } else if (!strcmp(t, "retain")) {
    report("retain", nw_publish_retained("echo.out", e->json));
  } else if (!strcmp(t, "save")) {
    report("save", nw_store_save(e->json));
  } else if (!strcmp(t, "load")) {
    int n = nw_store_load(buf, sizeof buf);
    nw_reply(n > 0 ? buf : "null");
  } else if (!strcmp(t, "late-declare")) {
    report("late-need", nw_need("power"));
    report("late-every", nw_every(100));
  } else if (!strcmp(t, "ask-peer")) {
    ask_token = nw_ask("peer", "hello", "{\"n\":7}", 500);
    report("ask", ask_token);
    return ask_token < 0 ? NW_DONE : NW_LATER;
  } else if (!strcmp(t, "ask-self")) {
    report("ask-self", nw_ask("echo", "ping", "1", 100));
  } else if (!strcmp(t, "send-peer")) {
    report("send", nw_send("peer", "note", "{\"text\":\"from a binary\"}"));
    report("send-nobody", nw_send("nobody", "note", "1"));
  } else if (!strcmp(t, "i2c")) {
    int h = nw_i2c_open("i2c0:0x1f", 10000);
    report("i2c-open", h);
    if (h < 0) return NW_DONE;
    unsigned char reg = 0x0b;
    i2c_token = nw_i2c(h, &reg, 1, 2, 2);
    report("i2c", i2c_token);
    return i2c_token < 0 ? NW_DONE : NW_LATER;
  } else if (!strcmp(t, "i2c-other")) {
    report("i2c-other", nw_i2c_open("i2c0:0x50", 10000));
    report("i2c-forged", nw_i2c(12345, (const unsigned char *)"\0", 1, 1, 0));
  } else if (!strcmp(t, "alloc")) {   // {"kb": N}: hold N KB more, or let go of everything with 0; what is held
    double kb = 0;
    nw_json_num(e->json, "kb", &kb);
    void *p = NULL;
    if (kb <= 0) { while (n_held) free(held[--n_held]); held_kb = 0; }
    else if (n_held < 16 && (p = malloc((size_t)kb * 1024))) { memset(p, 1, (size_t)kb * 1024); held[n_held++] = p; held_kb += (int)kb; }
    snprintf(buf, sizeof buf, "{\"ok\":%s,\"held_kb\":%d}", kb <= 0 || p ? "true" : "false", held_kb);
    nw_reply(buf);
  } else if (!strcmp(t, "segv")) {   // address 0 is ordinary memory in WebAssembly: this faults only as a process
    volatile int *volatile nowhere = 0;
    *nowhere = 1;
  } else if (!strcmp(t, "oob")) {   // outside the memory everywhere: unmapped in a process, past the end in a module
    volatile int *volatile far = (volatile int *)(uintptr_t)0xfffffff0u;
    *far = 1;
  } else if (!strcmp(t, "spin")) {
    for (volatile unsigned long i = 0;; i++) {}
  }
  return NW_DONE;
}
