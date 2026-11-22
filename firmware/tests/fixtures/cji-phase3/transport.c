// P4 acceptance build only. Keep canceled completions queued, as a network worker can.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "nucleus.h"

static struct {
  int ticket;
  vtime_t due;
  bool canceled, continuation, max_body;
} requests[2];

bool __wrap_port_agent_configured(void) { return true; }
const char *__wrap_port_agent_mode(void) { return "fixture"; }
const char *__wrap_port_agent_api(void) { return "responses"; }
const char *__wrap_port_agent_model(void) { return "fixture-model"; }

int __wrap_port_agent_start(int ticket, const char *body, size_t len, char *err, size_t cap) {
  if (!len || !strstr(body, "phase3-")) { snprintf(err, cap, "unexpected fixture input"); return -1; }
  for (int i = 0; i < 2; i++) if (!requests[i].ticket) {
    requests[i].ticket = ticket;
    requests[i].canceled = false;
    requests[i].max_body = len == AGENT_NET_REQUEST_MAX && !strncmp(body, "phase3-max", 10);
    requests[i].continuation = strstr(body, "function_call_output") != NULL;
    if (requests[i].continuation && (!strstr(body, "uptime_ms") || !strstr(body, "compositor"))) {
      requests[i].ticket = 0;
      snprintf(err, cap, "missing real device_status output");
      return -1;
    }
    requests[i].due = kernel_now() + MS(i ? 1000 : 600);
    klog("fixture: start ticket %d", ticket);
    return 0;
  }
  snprintf(err, cap, "fixture queue full");
  return -1;
}

void __wrap_port_agent_cancel(int ticket) {
  for (int i = 0; i < 2; i++) if (requests[i].ticket == ticket) {
    requests[i].canceled = true;
    klog("fixture: cancel ticket %d", ticket);
  }
}

int __wrap_port_agent_poll(int ticket, agent_net_result_t *out) {
  for (int i = 0; i < 2; i++) {
    if (!requests[i].ticket || kernel_now() < requests[i].due) continue;
    if (requests[i].canceled) {
      klog("fixture: late completion %d while polling %d", requests[i].ticket, ticket);
      requests[i].ticket = 0;
    } else if (requests[i].ticket == ticket) {
      requests[i].ticket = 0;
      out->status = 200;
      if (requests[i].max_body) {
        out->body = malloc(AGENT_NET_RESPONSE_MAX + 1);
        if (!out->body) return -1;
        memset(out->body, 'a', AGENT_NET_RESPONSE_MAX);
        out->body[AGENT_NET_RESPONSE_MAX - 1] = 'Z';
        out->body[AGENT_NET_RESPONSE_MAX] = 0;
        return 1;
      }
      out->body = xstrdup(requests[i].continuation
        ? "{\"status\":\"completed\",\"output\":[{\"type\":\"message\",\"role\":\"assistant\",\"content\":[{\"type\":\"output_text\",\"text\":\"phase3 replacement accepted\"}]}]}"
        : "{\"status\":\"completed\",\"output\":[{\"type\":\"function_call\",\"call_id\":\"status1\",\"name\":\"device_status\",\"arguments\":\"{}\"}]}");
      return 1;
    }
  }
  return 0;
}
