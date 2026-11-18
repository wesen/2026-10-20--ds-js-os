#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "nucleus.h"

// Bounded native HTTPS, with ownership independent of the JS object. Starting/cancelling is deferred
// like a bus transfer. A rebooted world cannot poll an old request, and disposal cancels its worker.
static struct {
  int ticket, owner, epoch;
  bool active, started, complete, cancelling;
  vtime_t since;
  agent_net_result_t result;
} agent_request;
static int agent_next_ticket;
static vtime_t agent_clock(void) {
  // Fixture latency is virtual; a real HTTPS deadline follows wall time even in the host simulator.
  return !strcmp(port_agent_mode(), "fixture") ? kernel_now() : port_clock();
}

static void agent_clear(void) {
  free(agent_request.result.body);
  memset(&agent_request, 0, sizeof agent_request);
}
void agent_drop(world_t *W) {
  if (!agent_request.active || agent_request.owner != W->id) return;
  if (agent_request.started) port_agent_cancel(agent_request.ticket);
  agent_clear();
}
static int agent_error(char *err, size_t cap, const char *message) {
  snprintf(err, cap, "%s", message);
  return -1;
}
static bool agent_owned(world_t *W, int ticket, char *err, size_t cap) {
  if (!world_claims(W, "net.agent")) snprintf(err, cap, "%s has no claim on net.agent", W->name);
  else if (ticket <= 0) snprintf(err, cap, "agent ticket must be a positive integer");
  else if (!agent_request.active || agent_request.ticket != ticket || agent_request.owner != W->id || agent_request.epoch != W->epoch)
    snprintf(err, cap, "agent request is not owned by this world or has already finished");
  else return true;
  return false;
}
static void run_agent_start(deferred_t *d, vtime_t at) {
  if (agent_request.active && agent_request.ticket == d->op && agent_request.epoch == d->epoch) {
    agent_request.since = agent_clock();
    int rc = port_agent_start(d->op, d->json, strlen(d->json), agent_request.result.error, sizeof agent_request.result.error);
    if (rc) {
      if (!agent_request.result.error[0]) snprintf(agent_request.result.error, sizeof agent_request.result.error, "agent transport could not start");
      agent_request.complete = true;
    } else agent_request.started = true;
  }
  free(d->json);
}
static void run_agent_cancel(deferred_t *d, vtime_t at) {
  (void)at;
  if (agent_request.active && agent_request.ticket == d->op && agent_request.epoch == d->epoch) {
    if (agent_request.started) port_agent_cancel(d->op);
    agent_clear();
  }
}
char *agent_status_json(void) {
  sbuf_t b = {0};
  sb_printf(&b, "{\"configured\":%s,\"mode\":", port_agent_configured() ? "true" : "false");
  sb_json_str(&b, port_agent_mode());
  sb_add(&b, ",\"api\":"); sb_json_str(&b, port_agent_api());
  sb_add(&b, ",\"model\":"); sb_json_str(&b, port_agent_model());
  sb_add(&b, "}");
  return b.s;
}

int agent_start(world_t *W, const char *body, size_t n, char *err, size_t cap) {
  if (!world_claims(W, "net.agent")) { snprintf(err, cap, "%s has no claim on net.agent", W->name); return -1; }
  if (agent_request.active) return agent_error(err, cap, "agent transport is busy");
  if (!port_agent_configured()) return agent_error(err, cap, "agent transport is not configured");
  if (agent_next_ticket == INT_MAX) return agent_error(err, cap, "agent request counter exhausted; reboot required");
  if (!body) return agent_error(err, cap, "agentNet.start needs JSON text");
  if (!n || n > AGENT_NET_REQUEST_MAX || memchr(body, 0, n)) {
    snprintf(err, cap, "agent request must contain 1..%d UTF-8 bytes of JSON", AGENT_NET_REQUEST_MAX);
    return -1;
  }
  deferred_t *d = calloc(1, sizeof *d);
  char *copy = malloc(n + 1);
  if (!d || !copy) { free(d); free(copy); return agent_error(err, cap, "out of memory"); }
  memcpy(copy, body, n); copy[n] = 0;
  agent_request.active = true;
  agent_request.ticket = ++agent_next_ticket;
  agent_request.owner = W->id; agent_request.epoch = W->epoch;
  d->run = run_agent_start; d->w = W->id; d->epoch = W->epoch; d->op = agent_request.ticket; d->json = copy;
  K.seg_cost += (vtime_t)(n * PROFILE.json_ns_per_byte / 1000.0); defer(d);
  return agent_request.ticket;
}
int agent_poll(world_t *W, int ticket, agent_net_result_t *result, char *err, size_t cap) {
  if (!agent_owned(W, ticket, err, cap)) return -1;
  if (agent_request.cancelling || (!agent_request.started && !agent_request.complete)) return 0;
  if (!agent_request.complete) {
    if (agent_clock() - agent_request.since >= MS(AGENT_NET_TIMEOUT_MS)) {
      port_agent_cancel(ticket);
      snprintf(agent_request.result.error, sizeof agent_request.result.error, "agent request timed out after %d ms", AGENT_NET_TIMEOUT_MS);
      agent_request.complete = true;
    } else {
      int rc = port_agent_poll(ticket, &agent_request.result);
      if (!rc) return 0;
      agent_request.complete = true;
      if (rc < 0 && !agent_request.result.error[0]) snprintf(agent_request.result.error, sizeof agent_request.result.error, "agent transport lost the request");
    }
  }
  size_t n = agent_request.result.body ? strnlen(agent_request.result.body, AGENT_NET_RESPONSE_MAX + 1) : 0;
  if (n > AGENT_NET_RESPONSE_MAX) {
    free(agent_request.result.body); agent_request.result.body = NULL; n = 0;
    snprintf(agent_request.result.error, sizeof agent_request.result.error, "agent response exceeds %d bytes", AGENT_NET_RESPONSE_MAX);
  } else if (n && !utf8_valid((const unsigned char *)agent_request.result.body, n)) {
    free(agent_request.result.body); agent_request.result.body = NULL; n = 0;
    snprintf(agent_request.result.error, sizeof agent_request.result.error, "agent response is not valid UTF-8");
  }
  *result = agent_request.result;
  agent_request.result.body = NULL;
  K.seg_cost += (vtime_t)(n * PROFILE.json_ns_per_byte / 1000.0);
  agent_clear();
  return 1;
}

int agent_cancel(world_t *W, int ticket, char *err, size_t cap) {
  if (!agent_owned(W, ticket, err, cap)) return -1;
  if (agent_request.cancelling) return 0;
  deferred_t *d = calloc(1, sizeof *d);
  if (!d) return agent_error(err, cap, "out of memory");
  agent_request.cancelling = true;
  d->run = run_agent_cancel; d->w = W->id; d->epoch = W->epoch; d->op = ticket;
  defer(d); return 1;
}

void agent_reset(void) {
  if (agent_request.active && agent_request.started) port_agent_cancel(agent_request.ticket);
  agent_clear();   // tickets are deliberately not reused across an in-process cold boot
}
