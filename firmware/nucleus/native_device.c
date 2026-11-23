// Native worlds' system calls on devices: bundled CJI graphics, handles, files, the clock and the network.
#include <limits.h>
#include <stdarg.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include "native_internal.h"

// Bundled CJI graphics operations. Rectangle arguments use four signed little-endian
// 32-bit words. The CJI compiler and firmware both target the same RV32 P4.
int64_t text_result(world_t *W, char *json, char *out, size_t cap) {
  if (!json) return fail(W, "out of memory");
  size_t len = strlen(json);
  if (len < cap) memcpy(out, json, len + 1);
  free(json);
  return len < cap ? (int64_t)len : fail(W, "result exceeds output buffer");
}

int64_t cji_graphics(world_t *W, const nw_call_t *c, char *out, size_t cap) {
  char err[160];
  int id = c->i[0], arg = c->i[1], op = c->op;
  int32_t rect[4] = {0};
  if (op == CJI_PIXELS || (op >= CJI_FILL && op <= CJI_TEXT)) {
    if (c->n[0] < sizeof rect || c->n[0] > sizeof rect + 7) return fail(W, "invalid drawing packet");
    if (op != CJI_PIXELS && c->n[0] > sizeof rect) {
      char color[8] = {0};
      memcpy(color, c->s[0] + sizeof rect, c->n[0] - sizeof rect);
      arg = gfx_color(color);
    }
    memcpy(rect, c->s[0], sizeof rect);
  }
  if (op == CJI_FONTS) return text_result(W, gfx_fonts_json(), out, cap);
  if (op == CJI_DMA) {
    if (!world_claims(W, "dma")) return fail(W, "%s has no claim on dma", W->name);
    if (id < 1 || arg < 1 || id > 640 || arg > 640) return fail(W, "a framebuffer is at most 640 x 640");
    int buf = dmabuf_alloc(id, arg);
    if (buf < 0) return fail(W, "out of DMA buffers");
    handle_t *h = handle_new(H_DMA, W, "dma");
    if (!h) { dmabuf_unref(buf); return fail(W, "out of handles"); }
    h->buf = buf;
    return h->id;
  }
  if (op == CJI_SPI) {
    if (c->n[0] != 4 || memcmp(c->s[0], "spi2", 4)) return fail(W, "panel SPI claim must be spi2");
    if (!world_claims(W, "spi2")) return fail(W, "%s has no claim on spi2", W->name);
    handle_t *h = handle_new(H_SPI, W, "spi2");
    if (!h) return fail(W, "out of handles");
    h->bus = BUS_SPI2;
    h->hz = id > 80000000 ? 80000000 : id;
    return h->id;
  }
  if (op == CJI_NARROW) {
    handle_t *parent = handle_use(W, id, -1, 0, err, sizeof err);
    if (!parent) return fail(W, "%s", err);
    handle_t *child = handle_child(W, parent, arg);
    return child ? child->id : fail(W, "out of handles");
  }
  if (op == CJI_CMD || op == CJI_PIXELS) {
    handle_t *spi = handle_use(W, id, H_SPI, R_WRITE, err, sizeof err);
    if (!spi) return fail(W, "%s", err);
    int token;
    if (op == CJI_CMD) {
      if (c->n[0] > 64) return fail(W, "a panel command carries at most 64 bytes");
      token = ++K.next_promise;
      hw_spi_cmd(W, spi, arg, (const uint8_t *)c->s[0], c->n[0], token);
    } else {
      handle_t *fb = handle_use(W, arg, H_DMA, R_READ, err, sizeof err);
      if (!fb) return fail(W, "%s", err);
      token = ++K.next_promise;
      hw_spi_pixels(W, spi, fb, rect[0], rect[1], rect[2], rect[3], token);
    }
    return token;
  }
  handle_t *h = handle_use(W, id, H_DMA, R_WRITE, err, sizeof err);
  if (!h) return fail(W, "%s", err);
  dmabuf_t *b = handle_buf(h);
  if (!b) return fail(W, "framebuffer is gone");
#if PICOCALC_MOBILE_PAINTER
  if (op == CJI_PAINTER_DRAW) {
    extern bool p4_painter_draw(dmabuf_t *, int, char *, size_t);
    if (strcmp(W->name, "compositor")) return fail(W, "painter requires the compositor");
    if (!p4_painter_draw(b, arg, out, cap)) return fail(W, "no accepted painter output");
    return strlen(out);
  }
#endif
#if PICOCALC_RAYTRACE
  if (op == CJI_RAYTRACE) {
    if (strcmp(W->name, "compositor") || c->n[0] != sizeof rect) return fail(W, "invalid raytrace request");
    memcpy(rect, c->s[0], sizeof rect);
    if (!gfx_raytrace(b, rect[0], rect[1], rect[2], rect[3], arg)) return fail(W, "invalid raytrace viewport or scene");
    return 0;
  }
#endif
  if (op == CJI_INVALIDATE) { gfx_invalidate(b); return 0; }
  if (op == CJI_COMMIT) {
    int rs[64 * 4], count = gfx_commit(b, rs, 64);
    sbuf_t json = {0};
    sb_add(&json, "[");
    for (int i = 0; i < count; ++i) {
      const int *r = rs + 4*i;
      sb_printf(&json, "%s[%d,%d,%d,%d]", i ? "," : "", r[0], r[1], r[2], r[3]);
    }
    sb_add(&json, "]");
    return text_result(W, json.s, out, cap);
  }
  if (op == CJI_TEXT) {
    char *text = str(c, 1), *font = str(c, 2);
    int width = text && font ? gfx_text(b, rect[0], rect[1], text, gfx_font_index(font), arg, rect[2]) : -1;
    free(text); free(font);
    return width >= 0 ? width : fail(W, "out of memory");
  }
  if (op == CJI_FILL) gfx_fill(b, rect[0], rect[1], rect[2], rect[3], arg);
  else if (op == CJI_RECT) gfx_rect(b, rect[0], rect[1], rect[2], rect[3], arg);
  else gfx_line(b, rect[0], rect[1], rect[2], rect[3], arg);
  return 0;
}


// The system calls on handles, files, the clock and the network (nat_syscall tries these first).
int64_t nat_syscall_device(world_t *W, const nw_call_t *c, char *out, size_t out_n) {
  switch (c->op) {
    // Firmware-private CJI operation, outside the public native wire ABI.
    case CJI_HANDLE_INFO: {
      char err[160];
      handle_t *h = handle_use(W, c->i[0], -1, 0, err, sizeof err);
      if (!h) return fail(W, "%s", err);
      return snprintf(out, out_n, "{\"type\":\"%s\",\"rights\":\"%s%s%s\",\"path\":\"%s\",\"file\":%s}",
                      handle_type_name(h->type), h->rights & R_READ ? "r" : "", h->rights & R_WRITE ? "w" : "",
                      h->rights & R_GRANT ? "g" : "", h->path, h->file ? "true" : "false");
    }
    case CJI_FS_OPEN: case CJI_FS_AT: case CJI_FS_OP: case NW_FS_OP: {
      char err[160] = "out of memory";
      char *args[3] = {0};
      int64_t result = -1;
      bool submit = c->op == CJI_FS_OP || c->op == NW_FS_OP;
      for (int i = 0; i < 3; i++) {
        if (!c->s[i]) continue;
        if (c->n[i] && memchr(c->s[i], 0, c->n[i]) && !(submit && i == 2 &&
            args[0] && (!strcmp(args[0], "write") || !strcmp(args[0], "append")))) {
          snprintf(err, sizeof err, "unexpected NUL in file operation");
          goto fs_done;
        }
        if (!(args[i] = str(c, i))) goto fs_done;
      }
      if (submit) {
        fs_job_t *job = fs_prepare(W, c->i[0], args[0], args[1], args[2], c->n[2], err, sizeof err);
        if (job) {
          result = ++K.next_promise;
          fs_defer(W, job, (int)result);
        }
      } else {
        handle_t *h = c->op == CJI_FS_OPEN ? fs_open_claim(W, args[0], err, sizeof err)
                                     : fs_at(W, c->i[0], args[0], args[1], err, sizeof err);
        if (h) result = h->id;
      }
fs_done:
      for (int i = 0; i < 3; i++) free(args[i]);
      return result < 0 ? fail(W, "%s", err) : result;
    }
    case CJI_REVOKE: case NW_REVOKE: {
      handle_t *h = handle_find(c->i[0]);
      if (!h) return fail(W, "there is no handle %d", (int)c->i[0]);
      if (h->minter != W->id || !h->parent) return fail(W, "only the world that narrowed handle %d can revoke it", h->id);
      h->revoked = true;
      return 1;
    }
    case CJI_WORLDS: case CJI_STATS: {
      if (!world_claims(W, "sys.read")) return fail(W, "%s has no claim on sys.read", W->name);
      char *fields = c->s[0] ? str(c, 0) : NULL;
      char *json = c->op == CJI_STATS ? kernel_stats_json() : kernel_worlds_json_fields(fields);
      free(fields);
      if (json) charge(strlen(json));
      return text_result(W, json, out, out_n);
    }
    case CJI_STORE_STATUS: {
      return snprintf(out, out_n, "{\"pending\":%s,\"error\":\"%s\"}", W->nat->store_pending ? "true" : "false",
                      W->nat->store_failed ? "persistent storage write failed" : "");
    }
    case CJI_AGENT_STATUS: case CJI_AGENT_START: case CJI_AGENT_POLL: case CJI_AGENT_CANCEL: case CJI_AGENT_BODY: {
      if (!world_claims(W, "net.agent")) return fail(W, "%s has no claim on net.agent", W->name);
      char err[160];
      int rc;
      if (c->op == CJI_AGENT_STATUS) return text_result(W, agent_status_json(), out, out_n);
      if (c->op == CJI_AGENT_START) rc = agent_start(W, c->s[0], c->n[0], err, sizeof err);
      else if (c->op == CJI_AGENT_CANCEL) rc = agent_cancel(W, c->i[0], err, sizeof err);
      else if (c->op == CJI_AGENT_BODY) {
        // The prelude consumes the body immediately after a completed poll in the same segment.
        char *body = W->nat->agent_body;
        W->nat->agent_body = NULL;
        return body ? text_result(W, body, out, out_n) : 0;
      } else {
        agent_net_result_t result;
        rc = agent_poll(W, c->i[0], &result, err, sizeof err);
        if (rc == 1) {
          free(W->nat->agent_body);
          W->nat->agent_body = result.body;
          sbuf_t json = {0};
          sb_printf(&json, "{\"status\":%d,\"error\":", result.status);
          sb_json_str(&json, result.error);
          sb_add(&json, "}");
          return text_result(W, json.s, out, out_n);
        }
      }
      return rc < 0 ? fail(W, "%s", err) : rc;
    }
    case NW_FS_OPEN: case NW_FS_AT: case NW_FS_READ: case NW_FS_WRITE: {
      if (c->n[0] && memchr(c->s[0], 0, c->n[0])) return fail(W, "unexpected NUL in file operation");
      char *path = str(c, 0);
      if (!path) return fail(W, "out of memory");
      char err[160];
      int result = -1;
      if (c->op == NW_FS_OPEN) {
        handle_t *handle = fs_open_claim(W, path, err, sizeof err);
        if (handle) result = handle->id;
      } else if (c->op == NW_FS_AT) {
        const char *rights = NULL;
        if (c->n[1] == 1 && c->s[1][0] == 'r') rights = "r";
        else if (c->n[1] == 1 && c->s[1][0] == 'w') rights = "w";
        else if (c->n[1] == 2 && !memcmp(c->s[1], "rw", 2)) rights = "rw";
        if (!rights) snprintf(err, sizeof err, "file rights must be r, w, or rw");
        else {
          handle_t *handle = fs_at(W, c->i[0], path, rights, err, sizeof err);
          if (handle) result = handle->id;
        }
      } else {
        bool write = c->op == NW_FS_WRITE;
        const char *text = c->s[1] ? c->s[1] : "";
        fs_job_t *job = fs_prepare(W, c->i[0], write ? "write" : "read", path,
                                   write ? text : NULL, write ? c->n[1] : 0, err, sizeof err);
        if (job) {
          result = ++K.next_promise;
          fs_defer(W, job, result);
        }
      }
      free(path);
      return result < 0 ? fail(W, "%s", err) : result;
    }
    case NW_CLOCK_OFFSET: {
      int64_t seconds = c->v / 1000;
      // Match the Date binding on ports with 32-bit time_t.
      if (sizeof(time_t) == 4) {
        int64_t min = (time_t)-1 < 0 ? INT32_MIN : 0;
        int64_t max = (time_t)-1 < 0 ? (int64_t)INT32_MAX : UINT32_MAX;
        if (seconds < min) seconds = min;
        if (seconds > max) seconds = max;
      }
      time_t instant = (time_t)seconds;
      struct tm utc, local;
      if (!gmtime_r(&instant, &utc) || !localtime_r(&instant, &local))
        return fail(W, "invalid clock instant");
      int days = local.tm_yday - utc.tm_yday;
      if (local.tm_year != utc.tm_year) days = local.tm_year > utc.tm_year ? 1 : -1;
      int minutes = (days * 24 + local.tm_hour - utc.tm_hour) * 60 + local.tm_min - utc.tm_min;
      return minutes + 1440;
    }
    case NW_CLOCK_WALL: return port_wall_ms();
    case NW_CLOCK_TODAY: {
      int64_t wall = port_wall_ms();
      if (wall < 0) return -1;
      int64_t seconds = wall / 1000;
      time_t instant = (time_t)seconds;
      struct tm local;
      if ((int64_t)instant != seconds || !localtime_r(&instant, &local)) return -1;
      int year = local.tm_year + 1900;
      if (year < 0 || year > 9999) return -1;
      return year * 10000 + (local.tm_mon + 1) * 100 + local.tm_mday;
    }
    case NW_CLOCK_ZONE: return snprintf(out, out_n, "%s", clock_zone());
    case NW_CLOCK_SETZONE: {
      if (!world_claims(W, "sys.clock")) return fail(W, "%s has no claim on sys.clock", W->name);
      if (!name_ok(c, 0, 64)) return fail(W, "invalid time zone");
      char *zone = str(c, 0);
      int64_t result = tz_valid(zone) ? (port_tz_set(zone) == 0) : fail(W, "invalid time zone");
      free(zone);
      return result;
    }
    case NW_NET_INFO: case NW_NET_RESULT: {
      if (!world_claims(W, "net.admin") && !(c->op == NW_NET_INFO && world_claims(W, "sys.read")))
        return fail(W, "%s has no claim on net.admin", W->name);
      char *json = c->op == NW_NET_INFO ? port_net_info() : port_net_scan_result();
      if (!json) return 0;
      size_t len = strlen(json);
      if (len >= out_n) { free(json); return fail(W, "network result exceeds buffer"); }
      memcpy(out, json, len + 1); free(json); charge(len);
      return len;
    }
    case NW_NET_SCAN: case NW_NET_JOIN: {
      if (!world_claims(W, "net.admin")) return fail(W, "%s has no claim on net.admin", W->name);
      char why[160] = "";
      if (c->op == NW_NET_SCAN) return port_net_scan(why, sizeof why) ? fail(W, "%s", why) : 1;
      if (!name_ok(c, 0, 33) || c->n[1] > 64 || (c->n[1] && memchr(c->s[1], 0, c->n[1])))
        return fail(W, "invalid Wi-Fi credentials");
      char *ssid = str(c, 0), *pw = str(c, 1);
      int64_t result;
      if (!net_ssid_ok(ssid) || !net_password_ok(pw)) result = fail(W, "invalid Wi-Fi credentials");
      else result = port_net_join(ssid, pw, why, sizeof why) ? fail(W, "%s", why) : 1;
      if (pw) secret_wipe(pw, c->n[1]);
      free(pw); free(ssid);
      return result;
    }
  }
  return NAT_NOT_DEVICE;
}
