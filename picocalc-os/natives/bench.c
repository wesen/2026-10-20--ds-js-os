// bench: how fast WAMR's interpreter runs on a board. At start it times loops of a fixed shape with nw_now() and logs
// "BENCH loop n=<iterations> us=<microseconds>"; the kernel's trace (console "trace on", or -vv on the host) logs the
// instructions each event took, so ns per instruction = us * 1000 / instructions for the loop events. A message
// "loop" with {"n": N} runs one more loop and replies with the time.
#include <stdint.h>
#include <stdio.h>
#include "nw.h"
#include "nw_json.h"

static uint32_t loop(uint32_t n) {   // xorshift: data-dependent, so the compiler keeps every iteration
  uint32_t x = 2463534242u, acc = 0;
  for (uint32_t i = 0; i < n; i++) { x ^= x << 13; x ^= x >> 17; x ^= x << 5; acc += x & 0xff; }
  return acc;
}

static int64_t timed(uint32_t n, uint32_t *r) { int64_t t0 = nw_now(); *r = loop(n); return nw_now() - t0; }

void nw_init(void) { nw_kind("service"); }

int nw_on_event(const nw_event *e) {
  char line[128];
  uint32_t r;
  if (e->kind == NW_START) {
    for (uint32_t n = 1000; n <= 16000; n *= 4) {   // within an app's 50 ms budget on the P4
      int64_t us = timed(n, &r);
      snprintf(line, sizeof line, "BENCH loop n=%u us=%lld r=%u", (unsigned)n, (long long)us, (unsigned)r);
      nw_log(line);
    }
  } else if (e->kind == NW_MESSAGE && e->ask) {
    double n = 0;
    nw_json_num(e->json, "n", &n);
    int64_t us = timed((uint32_t)n, &r);
    snprintf(line, sizeof line, "{\"n\":%u,\"us\":%lld,\"r\":%u}", (unsigned)n, (long long)us, (unsigned)r);
    nw_reply(line);
  }
  return NW_DONE;
}
