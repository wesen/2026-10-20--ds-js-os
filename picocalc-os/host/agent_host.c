// Host implementation of the nucleus's one-request model transport. No networking in the default
// build: PICOCALC_AGENT_FIXTURES names a directory of numbered, raw JSON response bodies. Optional
// make AGENT_LIVE=1 uses libcurl on a worker thread. The worker never enters the kernel or a JS VM.
#include <errno.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "../nucleus/nucleus.h"

#ifdef AGENT_LIVE
#include <curl/curl.h>
#include <pthread.h>
#include <stdatomic.h>
#endif

static const char *env_value(const char *name) {
  const char *s = getenv(name);
  return s && *s ? s : NULL;
}

const char *port_agent_mode(void) {
  if (env_value("PICOCALC_AGENT_FIXTURES")) return "fixture";
#ifdef AGENT_LIVE
  return "https";
#else
  return "offline";
#endif
}
bool port_agent_configured(void) {
  if (env_value("PICOCALC_AGENT_FIXTURES")) return true;
#ifdef AGENT_LIVE
  return env_value("PICOCALC_AGENT_URL") && env_value("PICOCALC_AGENT_TOKEN");
#else
  return false;
#endif
}

static struct {
  int ticket;
  unsigned sequence;
  vtime_t ready;
  agent_net_result_t result;
} fixture;

static char *bounded_file(const char *path, size_t max, char *error, size_t error_size) {
  FILE *f = fopen(path, "rb");
  if (!f) { snprintf(error, error_size, "fixture response is unavailable"); return NULL; }
  char *b = malloc(max + 1);
  if (!b) { fclose(f); snprintf(error, error_size, "out of memory reading fixture"); return NULL; }
  size_t n = fread(b, 1, max + 1, f);
  bool bad = ferror(f);
  fclose(f);
  if (n > max || bad || memchr(b, 0, n)) {
    free(b);
    snprintf(error, error_size, "%s", n > max ? "agent response exceeds 65536 bytes" : "fixture response is not valid text");
    return NULL;
  }
  b[n] = 0;
  return b;
}
static int fixture_integer(const char *dir, unsigned index, const char *suffix, int fallback, int low, int high) {
  char path[1024];
  if (snprintf(path, sizeof path, "%s/%03u.%s", dir, index, suffix) >= (int)sizeof path) return fallback;
  FILE *f = fopen(path, "r");
  if (!f) return fallback;
  long value = 0; int ok = fscanf(f, "%ld", &value);
  fclose(f);
  return ok == 1 && value >= low && value <= high ? (int)value : fallback;
}
static int fixture_start(int ticket, const char *dir, char *error, size_t error_size) {
  if (fixture.ticket) { snprintf(error, error_size, "fixture transport is busy"); return -1; }
  char path[1024];
  unsigned index = ++fixture.sequence;
  if (snprintf(path, sizeof path, "%s/%03u.json", dir, index) >= (int)sizeof path) {
    snprintf(error, error_size, "fixture directory path is too long"); return -1;
  }
  fixture.ticket = ticket;
  fixture.result.status = fixture_integer(dir, index, "status", 200, 100, 599);
  fixture.result.body = bounded_file(path, AGENT_NET_RESPONSE_MAX, fixture.result.error, sizeof fixture.result.error);
  // This function and fixture polling run on the kernel thread. Virtual time makes captures repeat.
  fixture.ready = kernel_now() + MS(fixture_integer(dir, index, "delay_ms", 120, 0, AGENT_NET_TIMEOUT_MS + 1000));
  return 0;
}

#ifdef AGENT_LIVE
static struct {
  pthread_mutex_t mutex;
  pthread_t thread;
  atomic_bool cancelled;
  bool active, done;
  int ticket;
  char *request, *url, *token, *ca_file;
  size_t request_len;
  agent_net_result_t result;
} live = { .mutex = PTHREAD_MUTEX_INITIALIZER };
static bool curl_ready;

typedef struct { char *data; size_t len; bool too_large, invalid_text, oom; } response_buffer_t;
static size_t receive_body(char *data, size_t size, size_t count, void *opaque) {
  response_buffer_t *b = opaque;
  if (size && count > SIZE_MAX / size) { b->too_large = true; return 0; }
  size_t n = size * count;
  if (n > AGENT_NET_RESPONSE_MAX - b->len) { b->too_large = true; return 0; }
  if (memchr(data, 0, n)) { b->invalid_text = true; return 0; }
  char *p = realloc(b->data, b->len + n + 1);
  if (!p) { b->oom = true; return 0; }
  b->data = p; memcpy(p + b->len, data, n); b->len += n; p[b->len] = 0;
  return n;
}
static int transfer_progress(void *unused, curl_off_t down_total, curl_off_t down, curl_off_t up_total, curl_off_t up) {
  (void)unused; (void)down_total; (void)down; (void)up_total; (void)up;
  return atomic_load(&live.cancelled) ? 1 : 0;
}
static bool safe_token(const char *token) {
  size_t n = strlen(token);
  if (!n || n > 4096) return false;
  for (size_t i = 0; i < n; i++) if ((unsigned char)token[i] < 0x21 || (unsigned char)token[i] > 0x7e) return false;
  return true;
}
static bool safe_url(const char *url) {
  if (strlen(url) > 2048) return false;
  CURLU *u = curl_url();
  if (!u) return false;
  bool valid = curl_url_set(u, CURLUPART_URL, url, 0) == CURLUE_OK;
  char *s = NULL;
  valid = valid && curl_url_get(u, CURLUPART_SCHEME, &s, 0) == CURLUE_OK && !strcmp(s, "https");
  curl_free(s); s = NULL;
  if (curl_url_get(u, CURLUPART_USER, &s, 0) == CURLUE_OK) valid = false;
  curl_free(s); s = NULL;
  if (curl_url_get(u, CURLUPART_PASSWORD, &s, 0) == CURLUE_OK) valid = false;
  curl_free(s); s = NULL;
  if (curl_url_get(u, CURLUPART_HOST, &s, 0) != CURLUE_OK || !s || !*s) valid = false;
  curl_free(s); curl_url_cleanup(u);
  return valid;
}
static void *https_worker(void *unused) {
  (void)unused;
  agent_net_result_t result = { 0 };
  response_buffer_t body = { 0 };
  CURL *curl = curl_easy_init();
  struct curl_slist *headers = NULL;
  char *authorization = NULL;
  if (!curl) { snprintf(result.error, sizeof result.error, "cannot initialize HTTPS client"); goto finished; }
  authorization = malloc(strlen(live.token) + 23);
  if (!authorization) { snprintf(result.error, sizeof result.error, "out of memory"); goto finished; }
  sprintf(authorization, "Authorization: Bearer %s", live.token);
  headers = curl_slist_append(headers, "Content-Type: application/json");
  headers = curl_slist_append(headers, "Accept: application/json");
  headers = curl_slist_append(headers, authorization);
  if (!headers) { snprintf(result.error, sizeof result.error, "cannot allocate HTTP headers"); goto finished; }
  curl_easy_setopt(curl, CURLOPT_URL, live.url);
#if LIBCURL_VERSION_NUM >= 0x075500
  curl_easy_setopt(curl, CURLOPT_PROTOCOLS_STR, "https");
  curl_easy_setopt(curl, CURLOPT_REDIR_PROTOCOLS_STR, "https");
#else
  curl_easy_setopt(curl, CURLOPT_PROTOCOLS, CURLPROTO_HTTPS);
  curl_easy_setopt(curl, CURLOPT_REDIR_PROTOCOLS, CURLPROTO_HTTPS);
#endif
  curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
  curl_easy_setopt(curl, CURLOPT_POST, 1L);
  curl_easy_setopt(curl, CURLOPT_POSTFIELDS, live.request);
  curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE, (long)live.request_len);
  curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 0L);  // do not send a credential to a redirected host
  curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 1L);
  curl_easy_setopt(curl, CURLOPT_SSL_VERIFYHOST, 2L);
  if (live.ca_file) curl_easy_setopt(curl, CURLOPT_CAINFO, live.ca_file);
  curl_easy_setopt(curl, CURLOPT_NOSIGNAL, 1L);
  curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT_MS, 15000L);
  curl_easy_setopt(curl, CURLOPT_TIMEOUT_MS, (long)AGENT_NET_TIMEOUT_MS);
  curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, receive_body);
  curl_easy_setopt(curl, CURLOPT_WRITEDATA, &body);
  curl_easy_setopt(curl, CURLOPT_XFERINFOFUNCTION, transfer_progress);
  curl_easy_setopt(curl, CURLOPT_NOPROGRESS, 0L);
  CURLcode rc = curl_easy_perform(curl);
  long status = 0;
  curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &status);
  result.status = (int)status;
  if (body.too_large) snprintf(result.error, sizeof result.error, "agent response exceeds %d bytes", AGENT_NET_RESPONSE_MAX);
  else if (body.invalid_text) snprintf(result.error, sizeof result.error, "agent response contains a NUL byte");
  else if (body.oom) snprintf(result.error, sizeof result.error, "out of memory reading agent response");
  else if (atomic_load(&live.cancelled)) snprintf(result.error, sizeof result.error, "agent request cancelled");
  else if (rc != CURLE_OK) snprintf(result.error, sizeof result.error, "HTTPS request failed: %s", curl_easy_strerror(rc));
finished:
  if (curl) curl_easy_cleanup(curl);
  curl_slist_free_all(headers); free(authorization);
  if (!result.error[0]) result.body = body.data; else free(body.data);
  pthread_mutex_lock(&live.mutex);
  live.result = result;
  live.done = true;
  pthread_mutex_unlock(&live.mutex);
  return NULL;
}
// The kernel thread alone owns active/ticket/config; done/result pass through the mutex. Reaping is
// possible only after the worker has finished all I/O, so joining cannot wait on a network operation.
static bool live_finished(void) {
  if (!live.active) return false;
  pthread_mutex_lock(&live.mutex); bool done = live.done; pthread_mutex_unlock(&live.mutex);
  return done;
}
static void live_reap(agent_net_result_t *result) {
  pthread_join(live.thread, NULL);
  if (result) *result = live.result; else free(live.result.body);
  free(live.request); free(live.url); free(live.token); free(live.ca_file);
  live.request = live.url = live.token = live.ca_file = NULL;
  memset(&live.result, 0, sizeof live.result);
  live.active = live.done = false; live.ticket = 0;
}
static int live_start(int ticket, const char *body, size_t len, char *error, size_t error_size) {
  if (live_finished()) live_reap(NULL);
  if (live.active) { snprintf(error, error_size, "HTTPS worker is still cancelling; retry shortly"); return -1; }
  const char *url = env_value("PICOCALC_AGENT_URL"), *token = env_value("PICOCALC_AGENT_TOKEN");
  if (!url || !token) { snprintf(error, error_size, "set PICOCALC_AGENT_URL and PICOCALC_AGENT_TOKEN"); return -1; }
  if (!curl_ready) {
    if (curl_global_init(CURL_GLOBAL_DEFAULT)) { snprintf(error, error_size, "cannot initialize libcurl"); return -1; }
    curl_ready = true;
  }
  if (!safe_url(url) || !safe_token(token)) { snprintf(error, error_size, "agent endpoint must be HTTPS without URL credentials; token must be printable ASCII"); return -1; }
  live.request = malloc(len + 1); live.url = strdup(url); live.token = strdup(token);
  const char *ca = env_value("PICOCALC_AGENT_CA_FILE");
  live.ca_file = ca ? strdup(ca) : NULL;
  if (!live.request || !live.url || !live.token || (ca && !live.ca_file)) {
    free(live.request); free(live.url); free(live.token); free(live.ca_file);
    live.request = live.url = live.token = live.ca_file = NULL;
    snprintf(error, error_size, "out of memory starting HTTPS request"); return -1;
  }
  memcpy(live.request, body, len); live.request[len] = 0; live.request_len = len;
  live.ticket = ticket; live.done = false; atomic_store(&live.cancelled, false);
  if (pthread_create(&live.thread, NULL, https_worker, NULL)) {
    free(live.request); free(live.url); free(live.token); free(live.ca_file);
    live.request = live.url = live.token = live.ca_file = NULL;
    live.ticket = 0;
    snprintf(error, error_size, "cannot start HTTPS worker"); return -1;
  }
  live.active = true;
  return 0;
}
#endif

int port_agent_start(int ticket, const char *body, size_t len, char *error, size_t error_size) {
  if (!body || !len || len > AGENT_NET_REQUEST_MAX) { snprintf(error, error_size, "agent request is too large or empty"); return -1; }
  const char *dir = env_value("PICOCALC_AGENT_FIXTURES");
  if (dir) return fixture_start(ticket, dir, error, error_size);
#ifdef AGENT_LIVE
  return live_start(ticket, body, len, error, error_size);
#else
  (void)ticket;
  snprintf(error, error_size, "networking is disabled; use fixtures or build with AGENT_LIVE=1"); return -1;
#endif
}
int port_agent_poll(int ticket, agent_net_result_t *result) {
  if (fixture.ticket == ticket) {
    if (kernel_now() < fixture.ready) return 0;
    *result = fixture.result;
    memset(&fixture.result, 0, sizeof fixture.result); fixture.ticket = 0;
    return 1;
  }
#ifdef AGENT_LIVE
  if (live.active && live.ticket == ticket) {
    if (!live_finished()) return 0;
    live_reap(result); return 1;
  }
#endif
  return -1;
}
void port_agent_cancel(int ticket) {
  if (fixture.ticket == ticket) {
    free(fixture.result.body); memset(&fixture.result, 0, sizeof fixture.result); fixture.ticket = 0;
  }
#ifdef AGENT_LIVE
  if (live.active && live.ticket == ticket) {
    atomic_store(&live.cancelled, true);
    if (live_finished()) live_reap(NULL);
  }
#endif
}
