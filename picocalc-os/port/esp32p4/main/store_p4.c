// Small world snapshots in a dedicated NVS partition, separate from private transport credentials.
#include <ctype.h>
#include <stdlib.h>
#include <string.h>
#include "esp_log.h"
#include "nvs.h"
#include "nvs_flash.h"
#include "p4.h"

#define STORE_PARTITION "agentstore"
#define STORE_RECORD_MAX (16 * 1024)
static bool records_ready, config_ready;

void p4_store_init(void) {
  esp_err_t e = nvs_flash_init();
  config_ready = e == ESP_OK;
  if (e != ESP_OK) ESP_LOGE("store", "credential NVS unavailable (%s); not erased", esp_err_to_name(e));
  e = nvs_flash_init_partition(STORE_PARTITION);
  records_ready = e == ESP_OK;
  if (e != ESP_OK) ESP_LOGE("store", "world store unavailable (%s); not erased", esp_err_to_name(e));
}

bool p4_config_available(void) { return config_ready; }

static bool name_ok(const char *ns, const char *key) {
  if (!ns || !key || (strcmp(ns, "w") && strcmp(ns, "k")) || !*key || strlen(key) > 15) return false;
  for (const unsigned char *p = (const unsigned char *)key; *p; p++)
    if (!isalnum(*p) && *p != '_' && *p != '-') return false;
  return true;
}

char *port_store_get(const char *ns, const char *key, size_t *len) {
  if (len) *len = 0;
  if (!records_ready || !name_ok(ns, key)) return NULL;
  nvs_handle_t h;
  if (nvs_open_from_partition(STORE_PARTITION, ns, NVS_READONLY, &h) != ESP_OK) return NULL;
  size_t n = 0;
  esp_err_t e = nvs_get_blob(h, key, NULL, &n);
  char *out = e == ESP_OK && n <= STORE_RECORD_MAX ? malloc(n + 1) : NULL;
  if (out && nvs_get_blob(h, key, out, &n) != ESP_OK) { free(out); out = NULL; }
  nvs_close(h);
  if (out) { out[n] = 0; if (len) *len = n; }
  return out;
}

int port_store_set(const char *ns, const char *key, const void *data, size_t len) {
  if (!records_ready || !name_ok(ns, key) || len > STORE_RECORD_MAX || (len && !data)) return -1;
  nvs_handle_t h;
  if (nvs_open_from_partition(STORE_PARTITION, ns, NVS_READWRITE, &h) != ESP_OK) return -1;
  esp_err_t e = len ? nvs_set_blob(h, key, data, len) : nvs_erase_key(h, key);
  if (!len && e == ESP_ERR_NVS_NOT_FOUND) e = ESP_OK;
  if (e == ESP_OK) e = nvs_commit(h);
  nvs_close(h);
  return e == ESP_OK ? 0 : -1;
}
