// The host's Wi-Fi station, simulated on the virtual clock so that Settings can be tested and its screenshots come
// out the same on every run. Three networks are in range; a join succeeds after 1.2 s with the right password and
// fails after 2 s with a wrong one. The password is compared and not kept; nothing here prints it.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include "../nucleus/nucleus.h"

static const struct { const char *ssid, *password, *ip; int rssi; } NETS[] = {
  { "picocalc-lab", "correct horse battery", "192.168.4.23", -48 },
  { "cafe-guest", "", "10.0.0.57", -71 },
  { "neighbour-5G", NULL, NULL, -83 },   // no password works
};
#define N_NETS (int)(sizeof NETS / sizeof NETS[0])
#define JOIN_US MS(1200)
#define FAIL_US MS(2000)
#define SCAN_US MS(1500)

static struct { char ssid[33]; int net; bool right; vtime_t at; } link = { .net = -1, .at = -1 };
static vtime_t scan_at = -1;   // when the running scan started, or -1
static bool scanned;

// off before any join; connecting for a while after one; then up, or failed with the reason
static const char *wifi_state(const char **why) {
  if (link.at < 0) { *why = "Wi-Fi not set up"; return "off"; }
  vtime_t since = kernel_now() - link.at;
  if (link.net < 0) *why = since < MS(3000) ? "connecting" : "network not found";
  else if (link.right) *why = since < JOIN_US ? "connecting" : "Wi-Fi connected";
  else *why = since < FAIL_US ? "connecting" : "wrong password";
  return !strcmp(*why, "connecting") ? "connecting" : link.right && link.net >= 0 ? "up" : "failed";
}

char *port_net_info(void) {
  const char *why, *wifi = wifi_state(&why);
  bool up = !strcmp(wifi, "up");
  const char *url = getenv("PICOCALC_AGENT_URL"), *fixtures = getenv("PICOCALC_AGENT_FIXTURES");
  char host[80] = "";
  if (url && !strncmp(url, "https://", 8)) {
    snprintf(host, sizeof host, "%s", url + 8);
    char *slash = strchr(host, '/'); if (slash) *slash = 0;
  } else if (fixtures && *fixtures) snprintf(host, sizeof host, "fixtures");
  sbuf_t b = { 0 };
  sb_add(&b, "{\"mode\":\"simulated\",\"wifi\":"); sb_json_str(&b, wifi);
  sb_add(&b, ",\"state\":"); sb_json_str(&b, why);
  sb_add(&b, ",\"ssid\":"); sb_json_str(&b, link.ssid);
  sb_add(&b, ",\"ip\":"); sb_json_str(&b, up ? NETS[link.net].ip : "");
  sb_printf(&b, ",\"rssi\":%d,\"clock\":%s", up ? NETS[link.net].rssi : 0, port_wall_ms() >= 0 ? "true" : "false");
  sb_add(&b, ",\"provider\":"); sb_json_str(&b, host);
  sb_add(&b, ",\"api\":"); sb_json_str(&b, port_agent_api());
  sb_add(&b, ",\"model\":"); sb_json_str(&b, port_agent_model());
  sb_printf(&b, ",\"key\":%s}", port_agent_configured() ? "true" : "false");
  return b.s;
}

int port_net_scan(char *why, size_t n) {
  if (scan_at >= 0 && kernel_now() - scan_at < SCAN_US) { snprintf(why, n, "a scan is running"); return 1; }
  scan_at = kernel_now();
  return 0;
}

char *port_net_scan_result(void) {
  if (scan_at >= 0 && kernel_now() - scan_at < SCAN_US) return NULL;
  if (scan_at >= 0) { scan_at = -1; scanned = true; }
  sbuf_t b = { 0 };
  sb_add(&b, "[");
  for (int i = 0; scanned && i < N_NETS; i++) {   // already strongest first
    sb_add(&b, i ? ",{\"ssid\":" : "{\"ssid\":"); sb_json_str(&b, NETS[i].ssid);
    sb_printf(&b, ",\"rssi\":%d,\"secure\":%s}", NETS[i].rssi, NETS[i].password && !*NETS[i].password ? "false" : "true");
  }
  sb_add(&b, "]");
  return b.s;
}

int port_net_join(const char *ssid, const char *password, char *why, size_t n) {
  if (!net_ssid_ok(ssid) || !net_password_ok(password)) { snprintf(why, n, "invalid network name or password"); return 1; }
  snprintf(link.ssid, sizeof link.ssid, "%s", ssid);
  link.net = -1; link.right = false; link.at = kernel_now();
  for (int i = 0; i < N_NETS; i++)
    if (!strcmp(NETS[i].ssid, ssid)) { link.net = i; link.right = NETS[i].password && !strcmp(NETS[i].password, password); }
  return 0;
}

// The host keeps the zone for this run only.
int port_tz_set(const char *tz) { setenv("TZ", tz, 1); tzset(); return 1; }
