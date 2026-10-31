// Direct Responses HTTPS transport. No JS or kernel state is accessed on this worker.
// The nucleus owns ticket/world/epoch authorization; this port owns a single bounded native request.
#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "sdkconfig.h"
#include "p4.h"

#ifndef PICOCALC_AGENT_WIFI
bool port_agent_configured(void) { return false; }
const char *port_agent_mode(void) { return "disabled"; }
int port_agent_start(int ticket, const char *body, size_t len, char *error, size_t error_size) {
  snprintf(error, error_size, "Wi-Fi support not built; enable PICOCALC_AGENT_WIFI");
  return -1;
}
int port_agent_poll(int ticket, agent_net_result_t *result) { return -1; }
void port_agent_cancel(int ticket) { }
void p4_agent_init(void) { }
void p4_agent_console(const char *args) {
  printf("net: disabled; build with -D PICOCALC_AGENT_WIFI=ON (see port guide)\n");
}
#else
#include <stdatomic.h>
#include <time.h>
#include "esp_crt_bundle.h"
#include "esp_event.h"
#include "esp_heap_caps.h"
#include "esp_http_client.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_netif_sntp.h"
#include "esp_timer.h"
#include "esp_wifi.h"
#include "freertos/event_groups.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "nvs.h"

#if !CONFIG_MBEDTLS_CERTIFICATE_BUNDLE
#error "PicoCalc agent requires verified HTTPS: enable the ESP certificate bundle"
#endif

#define NET_UP BIT0
#define CONFIG_NS "agentcfg"
#define TOKEN_MAX 512
#define ENDPOINT_MAX 255
#define NOTIFY_CONNECT BIT0
#define NOTIFY_REQUEST BIT1
#define NOTIFY_DISCONNECT BIT2
#define NOTIFY_TIME BIT3

typedef struct {
  char ssid[33], password[65], token[TOKEN_MAX + 1], endpoint[ENDPOINT_MAX + 1];
} transport_config_t;
static TaskHandle_t worker;
static SemaphoreHandle_t lock;
static EventGroupHandle_t events;
static atomic_bool configured;
static atomic_bool reconnect_allowed;
static atomic_int retries;
static char network_state[160] = "starting";
static bool wifi_initialized, wifi_started, sntp_started, wifi_init_attempted;
static esp_err_t wifi_init_result = ESP_FAIL;
static struct {
  int ticket;
  bool active, done, cancelled;
  char *request;
  size_t request_len;
  agent_net_result_t result;
} slot;

// Volatile writes prevent the compiler discarding credential cleanup as a dead store.
static void wipe(void *p, size_t n) { volatile unsigned char *q = p; while (n--) *q++ = 0; }
static void state_set(const char *s) {
  xSemaphoreTake(lock, portMAX_DELAY);
  snprintf(network_state, sizeof network_state, "%s", s);
  xSemaphoreGive(lock);
}

static bool config_get(transport_config_t *c) {
  memset(c, 0, sizeof *c);
  snprintf(c->endpoint, sizeof c->endpoint, "%s", CONFIG_PICOCALC_AGENT_ENDPOINT);
  if (!p4_config_available()) return false;
  nvs_handle_t h;
  if (nvs_open(CONFIG_NS, NVS_READONLY, &h) != ESP_OK) return false;
  size_t n = sizeof c->ssid; if (nvs_get_str(h, "ssid", c->ssid, &n) != ESP_OK) c->ssid[0] = 0;
  n = sizeof c->password; if (nvs_get_str(h, "password", c->password, &n) != ESP_OK) c->password[0] = 0;
  n = sizeof c->token; if (nvs_get_str(h, "token", c->token, &n) != ESP_OK) c->token[0] = 0;
  n = sizeof c->endpoint;
  if (nvs_get_str(h, "endpoint", c->endpoint, &n) != ESP_OK)
    snprintf(c->endpoint, sizeof c->endpoint, "%s", CONFIG_PICOCALC_AGENT_ENDPOINT);
  nvs_close(h);
  return c->ssid[0] && c->token[0];
}

// Only locally provisioned endpoints can receive the bearer; JS supplies neither URLs nor headers.
static bool endpoint_ok(const char *s) {
  if (strncmp(s, "https://", 8) || strlen(s) > ENDPOINT_MAX) return false;
  const char *host = s + 8, *path = strchr(host, '/');
  if (!path || path == host) return false;
  for (const char *p = host; p < path; p++)
    if (!isalnum((unsigned char)*p) && *p != '.' && *p != '-' && *p != ':') return false;
  for (const unsigned char *p = (const unsigned char *)s; *p; p++)
    if (*p < 33 || *p > 126 || *p == '@' || *p == '#' || *p == '?' || *p == '\\') return false;
  return true;
}

static void refresh_configured(void) {
  transport_config_t c;
  atomic_store(&configured, config_get(&c) && endpoint_ok(c.endpoint));
  wipe(&c, sizeof c);
}

static void wifi_event(void *arg, esp_event_base_t base, int32_t id, void *data) {
  if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
    atomic_store(&retries, 0);
    xEventGroupSetBits(events, NET_UP);
    if (worker) xTaskNotify(worker, NOTIFY_TIME, eSetBits);
    state_set("Wi-Fi connected; waiting for clock if necessary");
  } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) {
    if (atomic_load(&reconnect_allowed)) esp_wifi_connect();
  } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
    xEventGroupClearBits(events, NET_UP);
    if (atomic_load(&reconnect_allowed) && atomic_fetch_add(&retries, 1) < 5) {
      state_set("Wi-Fi reconnecting");
      esp_wifi_connect();
    } else state_set("Wi-Fi disconnected; check credentials, then net connect");
  }
}

static esp_err_t wifi_prepare(void) {
  if (wifi_initialized) return ESP_OK;
  // A partial initialization must not create a second default netif/handler set on retry.
  if (wifi_init_attempted) return wifi_init_result;
  wifi_init_attempted = true;
  esp_err_t e = esp_netif_init();
  if (e != ESP_OK) return wifi_init_result = e;
  e = esp_event_loop_create_default();
  if (e != ESP_OK && e != ESP_ERR_INVALID_STATE) return wifi_init_result = e;
  if (!esp_netif_create_default_wifi_sta()) return wifi_init_result = ESP_ERR_NO_MEM;
  e = esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, wifi_event, NULL);
  if (e == ESP_OK) e = esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, wifi_event, NULL);
  wifi_init_config_t wi = WIFI_INIT_CONFIG_DEFAULT();
  if (e == ESP_OK) e = esp_wifi_init(&wi);
  if (e == ESP_OK) e = esp_wifi_set_storage(WIFI_STORAGE_RAM);
  if (e == ESP_OK) e = esp_wifi_set_mode(WIFI_MODE_STA);
  if (e == ESP_OK) wifi_initialized = true;
  return wifi_init_result = e;
}

static void wifi_apply(void) {
  transport_config_t c;
  config_get(&c);
  if (!c.ssid[0]) { state_set("Wi-Fi not provisioned; use net ssid and net password"); wipe(&c, sizeof c); return; }
  atomic_store(&reconnect_allowed, false);
  xEventGroupClearBits(events, NET_UP);
  esp_err_t e = wifi_prepare();
  if (e == ESP_OK && wifi_started) { esp_wifi_stop(); wifi_started = false; }
  wifi_config_t wc = { 0 };
  memcpy(wc.sta.ssid, c.ssid, strlen(c.ssid));
  memcpy(wc.sta.password, c.password, strlen(c.password));
  wc.sta.threshold.authmode = c.password[0] ? WIFI_AUTH_WPA2_PSK : WIFI_AUTH_OPEN;
  wc.sta.pmf_cfg.capable = true;
  wc.sta.pmf_cfg.required = false;
  if (e == ESP_OK) e = esp_wifi_set_config(WIFI_IF_STA, &wc);
  wipe(&wc, sizeof wc); wipe(&c, sizeof c);
  atomic_store(&retries, 0);
  if (e == ESP_OK) {
    atomic_store(&reconnect_allowed, true);
    e = esp_wifi_start();
    wifi_started = e == ESP_OK;
  }
  if (e != ESP_OK) {
    char msg[120]; snprintf(msg, sizeof msg, "Wi-Fi initialization failed: %s", esp_err_to_name(e));
    state_set(msg); return;
  }
  if (!sntp_started) {
    esp_sntp_config_t sc = ESP_NETIF_SNTP_DEFAULT_CONFIG("pool.ntp.org");
    // The worker starts this after IP acquisition. This is the native wall clock, not JS Date.
    sc.start = false;
    sc.server_from_dhcp = false;
    sc.renew_servers_after_new_IP = false;
    sc.ip_event_to_renew = IP_EVENT_STA_GOT_IP;
    e = esp_netif_sntp_init(&sc);
    if (e == ESP_OK) sntp_started = true;
    else state_set("clock setup failed; HTTPS remains unavailable");
  }
}

static bool clock_ready(void) { return time(NULL) >= 1735689600; } // 2025-01-01, before this project existed
static bool cancelled(int ticket) {
  xSemaphoreTake(lock, portMAX_DELAY);
  bool b = !slot.active || slot.ticket != ticket || slot.cancelled;
  xSemaphoreGive(lock);
  return b;
}

static bool request_stopped(int ticket, int64_t deadline, char *error, size_t size) {
  if (cancelled(ticket)) { snprintf(error, size, "cancelled"); return true; }
  if (esp_timer_get_time() > deadline) { snprintf(error, size, "request deadline exceeded"); return true; }
  return false;
}

// Manual reads give us a hard response bound and a cancellation point per chunk. In IDF 5.4.2
// HTTP_EVENT_ON_DATA ignores the event handler's return code, so it cannot enforce these bounds.
static esp_err_t exchange(esp_http_client_handle_t client, int ticket, const char *request, size_t len,
                          int64_t deadline, agent_net_result_t *result) {
  // DNS + TCP + verified TLS use SDK timeouts; this is not a 10s total connect guarantee.
  esp_err_t e = esp_http_client_open(client, (int)len);
  if (e != ESP_OK) return e;
  esp_http_client_set_timeout_ms(client, 1000);
  size_t sent = 0;
  while (sent < len) {
    if (request_stopped(ticket, deadline, result->error, sizeof result->error)) return ESP_FAIL;
    int chunk = (int)(len - sent); if (chunk > 2048) chunk = 2048;
    int n = esp_http_client_write(client, request + sent, chunk);
    if (n <= 0) return ESP_ERR_HTTP_WRITE_DATA;
    sent += (size_t)n;
  }
  int64_t declared; int observed_status = 0;
  do {
    if (request_stopped(ticket, deadline, result->error, sizeof result->error)) return ESP_FAIL;
    declared = esp_http_client_fetch_headers(client);
    // IDF 5.4 resets status_code on every fetch_headers call. Preserve it if headers arrive
    // in fragments separated by a timeout after the status line has already been parsed.
    int status = esp_http_client_get_status_code(client);
    if (status >= 100) observed_status = status;
  } while (declared == -ESP_ERR_HTTP_EAGAIN);
  if (declared < 0) return ESP_ERR_HTTP_FETCH_HEADER;
  result->status = observed_status;
  if (result->status < 100) return ESP_ERR_HTTP_FETCH_HEADER;
  if (declared > AGENT_NET_RESPONSE_MAX) {
    snprintf(result->error, sizeof result->error, "response exceeds 65536 byte limit"); return ESP_FAIL;
  }
  char *body = heap_caps_malloc(AGENT_NET_RESPONSE_MAX + 1, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
  if (!body) return ESP_ERR_NO_MEM;
  size_t used = 0;
  char chunk[1024];
  for (;;) {
    if (request_stopped(ticket, deadline, result->error, sizeof result->error)) { e = ESP_FAIL; break; }
    int n = esp_http_client_read(client, chunk, sizeof chunk);
    if (n == -ESP_ERR_HTTP_EAGAIN) continue;
    if (n < 0) { e = ESP_FAIL; break; }
    if (!n) {
      e = esp_http_client_is_complete_data_received(client) ? ESP_OK : ESP_FAIL;
      if (e != ESP_OK) snprintf(result->error, sizeof result->error, "HTTP response was truncated");
      break;
    }
    if ((size_t)n > AGENT_NET_RESPONSE_MAX - used) {
      snprintf(result->error, sizeof result->error, "response exceeds 65536 byte limit"); e = ESP_FAIL; break;
    }
    if (memchr(chunk, 0, (size_t)n)) {
      snprintf(result->error, sizeof result->error, "response contains a NUL byte"); e = ESP_FAIL; break;
    }
    memcpy(body + used, chunk, (size_t)n); used += (size_t)n;
  }
  if (e == ESP_OK) { body[used] = 0; result->body = body; }
  else free(body);
  return e;
}

static void request_run(int ticket, char *request, size_t len) {
  agent_net_result_t result = { 0 };
  transport_config_t c;
  bool ready = config_get(&c);
  int64_t deadline = esp_timer_get_time() + (int64_t)AGENT_NET_TIMEOUT_MS * 1000;
  esp_http_client_handle_t client = NULL;
  char bearer[TOKEN_MAX + 8] = "";
  if (!ready || !endpoint_ok(c.endpoint)) snprintf(result.error, sizeof result.error, "transport is not provisioned");
  else if (!(xEventGroupGetBits(events) & NET_UP)) snprintf(result.error, sizeof result.error, "Wi-Fi is not connected; use net status");
  else if (!clock_ready()) snprintf(result.error, sizeof result.error, "waiting for network time before verified TLS");
  else if (cancelled(ticket)) snprintf(result.error, sizeof result.error, "cancelled");
  else {
    esp_http_client_config_t hc = {
      .url = c.endpoint, .method = HTTP_METHOD_POST,
      .timeout_ms = 10000,
      .crt_bundle_attach = esp_crt_bundle_attach,
      .disable_auto_redirect = true,
      .skip_cert_common_name_check = false,
      .buffer_size = 2048, .buffer_size_tx = 2048,
    };
    client = esp_http_client_init(&hc);
    if (!client) snprintf(result.error, sizeof result.error, "HTTP client allocation failed");
    else {
      snprintf(bearer, sizeof bearer, "Bearer %s", c.token);
      esp_err_t e = esp_http_client_set_header(client, "Authorization", bearer);
      if (e == ESP_OK) e = esp_http_client_set_header(client, "Content-Type", "application/json");
      if (e == ESP_OK) e = esp_http_client_set_header(client, "Accept", "application/json");
      // All blocking DNS/TCP/TLS/HTTP runs here on core 0; no JavaScript lane is occupied.
      if (e == ESP_OK) e = exchange(client, ticket, request, len, deadline, &result);
      if (e != ESP_OK && !result.error[0])
        snprintf(result.error, sizeof result.error, "HTTPS request failed: %s", esp_err_to_name(e));
    }
  }
  if (client) esp_http_client_cleanup(client);
  wipe(&c, sizeof c); wipe(bearer, sizeof bearer); free(request);
  xSemaphoreTake(lock, portMAX_DELAY);
  if (slot.active && slot.ticket == ticket && !slot.cancelled) { slot.result = result; slot.done = true; }
  else { free(result.body); memset(&slot, 0, sizeof slot); }
  xSemaphoreGive(lock);
}

static void network_task(void *arg) {
  wifi_apply();
  for (;;) {
    uint32_t flags = 0;
    xTaskNotifyWait(0, UINT32_MAX, &flags, portMAX_DELAY);
    if ((flags & NOTIFY_DISCONNECT) && wifi_started) esp_wifi_disconnect();
    if (flags & NOTIFY_CONNECT) wifi_apply();
    if ((flags & NOTIFY_TIME) && sntp_started) esp_netif_sntp_start();
    if (flags & NOTIFY_REQUEST) {
      xSemaphoreTake(lock, portMAX_DELAY);
      int ticket = slot.ticket;
      char *request = slot.request; size_t len = slot.request_len;
      slot.request = NULL;
      xSemaphoreGive(lock);
      if (request) request_run(ticket, request, len);
    }
  }
}

void p4_agent_init(void) {
  // SDK debug logs can include request headers; never allow bearer headers into the UART log.
  esp_log_level_set("HTTP_CLIENT", ESP_LOG_WARN);
  esp_log_level_set("HTTP_HEADER", ESP_LOG_WARN);
  lock = xSemaphoreCreateMutex(); events = xEventGroupCreate();
  if (!lock || !events) { printf("net: cannot allocate worker synchronization\n"); return; }
  refresh_configured();
  if (xTaskCreatePinnedToCore(network_task, "agent-net", 12 * 1024, NULL, 3, &worker, 0) != pdPASS) {
    worker = NULL; printf("net: cannot create worker\n");
  }
}
bool port_agent_configured(void) { return worker && atomic_load(&configured); }
const char *port_agent_mode(void) { return "https"; }

int port_agent_start(int ticket, const char *body, size_t len, char *error, size_t error_size) {
  if (!worker || !atomic_load(&configured)) { snprintf(error, error_size, "set Wi-Fi and API credentials with net commands"); return -1; }
  if (!body || !len || len > AGENT_NET_REQUEST_MAX) { snprintf(error, error_size, "invalid request size"); return -1; }
  char *copy = heap_caps_malloc(len + 1, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
  if (!copy) { snprintf(error, error_size, "no PSRAM for request"); return -1; }
  memcpy(copy, body, len); copy[len] = 0;
  xSemaphoreTake(lock, portMAX_DELAY);
  if (slot.active) {
    xSemaphoreGive(lock); free(copy);
    snprintf(error, error_size, "previous network request is still closing; retry shortly"); return -1;
  }
  slot.active = true; slot.ticket = ticket; slot.request = copy; slot.request_len = len;
  xSemaphoreGive(lock);
  xTaskNotify(worker, NOTIFY_REQUEST, eSetBits);
  return 0;
}

int port_agent_poll(int ticket, agent_net_result_t *result) {
  if (!lock) return -1;
  xSemaphoreTake(lock, portMAX_DELAY);
  int rc = !slot.active || slot.ticket != ticket || slot.cancelled ? -1 : slot.done ? 1 : 0;
  if (rc == 1) { *result = slot.result; memset(&slot, 0, sizeof slot); }
  xSemaphoreGive(lock);
  return rc;
}

void port_agent_cancel(int ticket) {
  if (!lock) return;
  xSemaphoreTake(lock, portMAX_DELAY);
  if (slot.active && slot.ticket == ticket) {
    if (slot.done) { free(slot.result.body); memset(&slot, 0, sizeof slot); }
    else slot.cancelled = true;
  }
  xSemaphoreGive(lock);
  // Cancellation is logical immediately. The worker owns the HTTP handle until its read/timeout
  // exits, so there is no cross-task close/free race. A new request reports busy until cleanup finishes.
}

static bool config_set(const char *key, const char *value) {
  if (!p4_config_available()) return false;
  nvs_handle_t h;
  if (nvs_open(CONFIG_NS, NVS_READWRITE, &h) != ESP_OK) return false;
  esp_err_t e = nvs_set_str(h, key, value);
  if (e == ESP_OK) e = nvs_commit(h);
  nvs_close(h);
  refresh_configured();
  return e == ESP_OK;
}

void p4_agent_console(const char *args) {
  char cmd[24] = ""; int n = 0;
  sscanf(args, "%23s%n", cmd, &n);
  const char *value = args + n;
  // Exactly one delimiter; any further spaces are part of an SSID/passphrase.
  if (*value == ' ' || *value == '\t') value++;
  if (!*cmd || !strcmp(cmd, "status")) {
    char state[sizeof network_state] = "worker unavailable";
    if (lock) { xSemaphoreTake(lock, portMAX_DELAY); memcpy(state, network_state, sizeof state); xSemaphoreGive(lock); }
    printf("net: configured=%s wifi=%s clock=%s state=%s\n", port_agent_configured() ? "yes" : "no",
           events && (xEventGroupGetBits(events) & NET_UP) ? "up" : "down", clock_ready() ? "set" : "unset", state);
  } else if (!strcmp(cmd, "connect")) {
    if (worker) { xTaskNotify(worker, NOTIFY_CONNECT, eSetBits); printf("net: connect queued\n"); }
    else printf("net: worker unavailable\n");
  } else if (!strcmp(cmd, "ssid") || !strcmp(cmd, "password") || !strcmp(cmd, "token") || !strcmp(cmd, "endpoint")) {
    size_t size = strlen(value);
    bool valid = !strcmp(cmd, "ssid") ? size > 0 && size <= 32 :
                 !strcmp(cmd, "password") ? size == 0 || (size >= 8 && size <= 64) :
                 !strcmp(cmd, "token") ? size > 0 && size <= TOKEN_MAX : endpoint_ok(value);
    for (const unsigned char *p = (const unsigned char *)value; *p; p++)
      if (*p < 32 || *p == 127 || (!strcmp(cmd, "token") && (*p > 126 || isspace(*p))) ||
          (!strcmp(cmd, "password") && size == 64 && !isxdigit(*p))) valid = false;
    if (!valid) printf("net: invalid %s (value not printed)\n", cmd);
    else printf("net: %s %s; net connect applies Wi-Fi changes\n", cmd, config_set(cmd, value) ? "saved" : "save failed");
  } else if (!strcmp(cmd, "forget")) {
    // This is an explicit console operation. World snapshots in agentstore are deliberately separate.
    nvs_handle_t h;
    esp_err_t e = p4_config_available() ? nvs_open(CONFIG_NS, NVS_READWRITE, &h) : ESP_FAIL;
    if (e == ESP_OK) { e = nvs_erase_all(h); if (e == ESP_OK) e = nvs_commit(h); nvs_close(h); }
    refresh_configured();
    atomic_store(&reconnect_allowed, false);
    if (lock) {
      xSemaphoreTake(lock, portMAX_DELAY);
      if (slot.active && slot.done) { free(slot.result.body); memset(&slot, 0, sizeof slot); }
      else if (slot.active) slot.cancelled = true;
      xSemaphoreGive(lock);
    }
    if (worker) xTaskNotify(worker, NOTIFY_DISCONNECT, eSetBits);
    printf("net: credential removal %s\n", e == ESP_OK ? "complete" : "failed");
  } else printf("net status | ssid NAME | password VALUE | token VALUE | endpoint HTTPS_URL | connect | forget\n");
}
#endif
