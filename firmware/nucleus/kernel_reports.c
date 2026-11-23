// Status and the JSON reports of worlds, handles and statistics that sys.read worlds ask for.
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "kernel_internal.h"
#if PICOCALC_MOBILE_PAINTER
#include "../sdk/typed/chess-psix.h"
#endif

// ---- status ---------------------------------------------------------------------------------------------------
void publish_status(world_t *W, const char *state, const char *why, vtime_t in_us) {
  sbuf_t b = { 0 };
  sb_add(&b, "{\"world\":"); sb_json_str(&b, W->name);
  sb_add(&b, ",\"state\":"); sb_json_str(&b, state);
  if (why) { sb_add(&b, ",\"why\":"); sb_json_str(&b, why); }
  sb_printf(&b, ",\"restarts\":%d,\"crashes\":%d,\"in_ms\":%lld,\"t\":%.3f}", restarts_of(W), W->n_crash_times, (long long)(in_us / 1000), kernel_now() / 1000.0);
  kernel_publish(NULL, "worlds.status", b.s, NULL, 0);
  free(b.s);
}

// ---- reports ---------------------------------------------------------------------------------------------------
static const char *state_name(world_t *W) {
  if (W->status == W_STOPPED) return "stopped";
  if (W->status == W_RESTARTING) return "restarting";
  if (W->in_turn) return W->turn_async ? "waiting" : "busy";
  return "idle";
}

char *kernel_worlds_json(void) { return kernel_worlds_json_fields(NULL); }

// fields: a comma-separated list of the keys wanted ("name,state"), or NULL / "" for all of them
static bool wants(const char *fields, const char *key) {
  if (!fields || !*fields) return true;
  size_t n = strlen(key);
  for (const char *p = fields; (p = strstr(p, key)); p += n)
    if ((p == fields || p[-1] == ',') && (p[n] == ',' || !p[n])) return true;
  return false;
}
char *kernel_worlds_json_fields(const char *fields) {
  sbuf_t b = { 0 };
  sb_add(&b, "[");
  for (int i = 0; i < K.n_worlds; i++) {
    world_t *W = K.worlds[i];
    const char *sep = "{";
    sb_add(&b, i ? "," : "");
#define FIELD(key) (wants(fields, key) && (sb_add(&b, sep), sep = ",", sb_add(&b, "\"" key "\":"), 1))
    if (FIELD("name")) sb_json_str(&b, W->name);
    if (FIELD("kind")) sb_json_str(&b, W->kind);
    if (FIELD("engine")) sb_json_str(&b, engine_name(W->engine));
    if (FIELD("title")) sb_json_str(&b, W->title);
    if (FIELD("state")) sb_printf(&b, "\"%s\"", state_name(W));
    if (FIELD("turns")) sb_printf(&b, "%llu", (unsigned long long)W->turns);
    if (FIELD("msgs")) sb_printf(&b, "%llu", (unsigned long long)W->msgs);
    if (FIELD("cpu_ms")) sb_printf(&b, "%.3f", W->cpu_us / 1000.0);
    if (FIELD("mem_kb")) sb_printf(&b, "%.1f", W->mem_used / PROFILE.mem_scale / 1024.0);
    if (FIELD("limit_kb")) sb_printf(&b, "%zu", W->mem_limit / 1024);
    if (FIELD("mbox")) sb_printf(&b, "%d", W->mbox_len);
    if (FIELD("mbox_peak")) sb_printf(&b, "%d", W->mbox_peak);
    if (FIELD("restarts")) sb_printf(&b, "%d", restarts_of(W));
    if (FIELD("budget_ms")) sb_printf(&b, "%lld", (long long)(W->budget_us / 1000));
    if (FIELD("last_error")) sb_json_str(&b, W->last_error);
    if (FIELD("user")) sb_add(&b, W->user ? "true" : "false");
    if (FIELD("file")) sb_json_str(&b, W->file);
    // what an app shows on the launcher: only when asked for, so the reports that poll stay small
#define ASKED(key) (fields && *fields && FIELD(key))
    if (ASKED("icon")) sb_add(&b, W->icon ? W->icon : "null");
    if (ASKED("about")) sb_json_str(&b, W->about);
    if (ASKED("key")) sb_json_str(&b, W->key);
#undef ASKED
    if (FIELD("claims")) {
      sb_add(&b, "[");
      for (int k = 0; k < W->n_claims; k++) { if (k) sb_add(&b, ","); sb_json_str(&b, W->claims[k]); }
      sb_add(&b, "]");
    }
#undef FIELD
    sb_add(&b, *sep == '{' ? "{}" : "}");
  }
  sb_add(&b, "]");
  return b.s;
}

char *kernel_stats_json(void) {
  sbuf_t b = { 0 };
  char *buses = hw_buses_json();
  int nh = 0;
  for (int i = 0; i < MAX_HANDLES; i++) nh += K.handles[i].live;
  sb_add(&b, "{\"board\":"); sb_json_str(&b, port_board_name());
  sb_printf(&b, ",\"clock\":\"%s\",\"t_ms\":%.3f,\"lane_busy_ms\":%.3f,\"turns\":%llu,\"segments\":%llu,\"published\":%llu,\"delivered\":%llu,\"crashes\":%llu,\"handles\":%d,\"step_ns\":%.1f,\"buses\":%s}",
            K.realtime ? "real" : "virtual", kernel_now() / 1000.0, K.lane_busy / 1000.0, (unsigned long long)K.turns, (unsigned long long)K.segments,
            (unsigned long long)K.published, (unsigned long long)K.delivered, (unsigned long long)K.crashes, nh, PROFILE.ns_per_step, buses);
  free(buses);
  return b.s;
}

void kernel_stats_print(void) {
  printf("t = %.1f ms, lane busy %.1f ms (%.1f%%), %llu turns, %llu published, %llu delivered, %llu crashes\n",
         K.vnow / 1000.0, K.lane_busy / 1000.0, K.vnow ? 100.0 * K.lane_busy / K.vnow : 0.0, (unsigned long long)K.turns,
         (unsigned long long)K.published, (unsigned long long)K.delivered, (unsigned long long)K.crashes);
  printf("  %-11s %-8s %-10s %7s %9s %8s %6s %4s  %s\n", "world", "kind", "state", "turns", "cpu ms", "mem KB", "limit", "rst", "last error");
  for (int i = 0; i < K.n_worlds; i++) {
    world_t *W = K.worlds[i];
    printf("  %-11s %-8s %-10s %7llu %9.2f %8.1f %6zu %4d  %s\n", W->name, W->kind, state_name(W), (unsigned long long)W->turns, W->cpu_us / 1000.0,
           W->mem_used / PROFILE.mem_scale / 1024.0, W->mem_limit / 1024, restarts_of(W), W->last_error);
  }
  for (int i = 0; i < K.n_buses; i++)
    printf("  bus %-5s busy %8.2f ms, %llu transfers, %llu bytes, %llu errors\n", K.buses[i].name, K.buses[i].busy_us / 1000.0,
           (unsigned long long)K.buses[i].transfers, (unsigned long long)K.buses[i].bytes, (unsigned long long)K.buses[i].errors);
}
