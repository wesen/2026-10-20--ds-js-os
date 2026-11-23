// The MicroQuickJS binding's own declarations, shared by vm_mqjs.c (runtime and lifecycle), vm_mqjs_ops.c (the
// operation table, __k, __ka and most operations) and vm_mqjs_gfx.c (pixels, system, clock and store operations).
// Nothing outside those three files includes this.
#pragma once
#include <stdbool.h>
#include <stddef.h>
#include "nucleus.h"
#include "mquickjs.h"

struct vmw {
  JSContext *ctx;
  uint8_t *arena;
  size_t size;
  unsigned ooms;            // out-of-memory errors seen: one more after a segment means it hit its limit
  uint8_t *prelude;         // this world's relocated copy of the compiled prelude (lives as long as the context)
};
#define WORLD ((world_t *)JS_GetContextOpaque(ctx))
typedef JSValue (*op_fn)(JSContext *ctx, world_t *W, int argc, JSValue *argv);

// vm_mqjs.c: the engine log's sink while an error is formatted, argument helpers
extern sbuf_t *log_sink;
int iarg(JSContext *ctx, JSValue *argv, int argc, int i, int def);
double darg(JSContext *ctx, JSValue *argv, int argc, int i, double def);
char *sarg(JSContext *ctx, JSValue *argv, int argc, int i);
int int_list(JSContext *ctx, JSValue *argv, int argc, int i, int *out, int max);
pixel_t color_arg(JSContext *ctx, JSValue *argv, int argc, int i);
JSValue fail(JSContext *ctx, const char *fmt, ...) __attribute__((format(printf, 2, 3)));
JSValue json_value(JSContext *ctx, char *json);
void charge_json(size_t n);
bool check_grants(JSContext *ctx, world_t *W, const int *hs, int nh);

// vm_mqjs_ops.c: handles; the host functions (mqjs_stdlib.h, included by vm_mqjs.c, names them)
handle_t *use(JSContext *ctx, world_t *W, int id, int type, int right);
JSValue js_nucleus_k(JSContext *ctx, JSValue *this_val, int argc, JSValue *argv);
JSValue js_nucleus_ka(JSContext *ctx, JSValue *this_val, int argc, JSValue *argv);

// vm_mqjs_gfx.c: pixels, system, clock and store operations; the wall clock's offset (clock.set)
extern double wall_offset_ms;
JSValue op_gfx_fill(JSContext *ctx, world_t *W, int argc, JSValue *argv);
JSValue op_gfx_rect(JSContext *ctx, world_t *W, int argc, JSValue *argv);
JSValue op_gfx_line(JSContext *ctx, world_t *W, int argc, JSValue *argv);
JSValue op_gfx_text(JSContext *ctx, world_t *W, int argc, JSValue *argv);
JSValue op_gfx_measure(JSContext *ctx, world_t *W, int argc, JSValue *argv);
JSValue op_gfx_wrap(JSContext *ctx, world_t *W, int argc, JSValue *argv);
JSValue op_gfx_commit(JSContext *ctx, world_t *W, int argc, JSValue *argv);
JSValue op_gfx_invalidate(JSContext *ctx, world_t *W, int argc, JSValue *argv);
JSValue op_gfx_persist(JSContext *ctx, world_t *W, int argc, JSValue *argv);
JSValue op_gfx_adopt(JSContext *ctx, world_t *W, int argc, JSValue *argv);
JSValue op_gfx_hash(JSContext *ctx, world_t *W, int argc, JSValue *argv);
JSValue op_gfx_fonts(JSContext *ctx, world_t *W, int argc, JSValue *argv);
JSValue op_sys_worlds(JSContext *ctx, world_t *W, int argc, JSValue *argv);
JSValue op_sys_handles(JSContext *ctx, world_t *W, int argc, JSValue *argv);
JSValue op_sys_stats(JSContext *ctx, world_t *W, int argc, JSValue *argv);
JSValue op_sys_fault(JSContext *ctx, world_t *W, int argc, JSValue *argv);
JSValue op_timer_set(JSContext *ctx, world_t *W, int argc, JSValue *argv);
JSValue op_sys_front(JSContext *ctx, world_t *W, int argc, JSValue *argv);
JSValue op_sys_restart(JSContext *ctx, world_t *W, int argc, JSValue *argv);
JSValue op_clock_set(JSContext *ctx, world_t *W, int argc, JSValue *argv);
JSValue op_store_load(JSContext *ctx, world_t *W, int argc, JSValue *argv);
JSValue op_store_save(JSContext *ctx, world_t *W, int argc, JSValue *argv);
void run_poweroff(deferred_t *d, vtime_t at);
