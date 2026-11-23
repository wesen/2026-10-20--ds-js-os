// The QuickJS binding's own declarations, shared by vm.c (runtime and lifecycle), vm_ops.c (a world's operations on
// itself, messages, handles and graphics) and vm_sys.c (system, network, storage and agent operations; __k and __ka).
// Nothing outside those three files includes this.
#pragma once
#include <stdbool.h>
#include <stddef.h>
#include "nucleus.h"
#include "quickjs.h"

// What this binding keeps per world, behind world_t's opaque vm pointer.
typedef struct { int id; JSValue resolve, reject; } pending_t;
struct vmw {
  JSRuntime *rt;
  JSContext *ctx;
  pending_t *pend; int n_pend, cap_pend;   // the world's promises the kernel will settle
  JSValue fn_dispatch, fn_render;
  JSValue unhandled[8], unhandled_why[8]; int n_unhandled;
  bool store_pending;
  char store_error[160];
};
#define WORLD (world_t *)JS_GetContextOpaque(ctx)
typedef JSValue (*op_fn)(JSContext *ctx, world_t *W, int argc, JSValueConst *argv);

// vm_ops.c: errors and argument helpers
const char *vm_exception(JSContext *ctx, char *buf, size_t n);
void set_error(world_t *W);
int iarg(JSContext *ctx, JSValueConst *argv, int argc, int i, int def);
double darg(JSContext *ctx, JSValueConst *argv, int argc, int i, double def);
char *sarg(JSContext *ctx, JSValueConst *argv, int argc, int i);   // a copy, or NULL
int int_list(JSContext *ctx, JSValueConst v, int *out, int max);
pixel_t color_arg(JSContext *ctx, JSValueConst *argv, int argc, int i);
JSValue fail(JSContext *ctx, const char *fmt, ...) __attribute__((format(printf, 2, 3)));
JSValue json_value(JSContext *ctx, char *json);   // takes ownership
void charge_json(size_t n);
bool check_grants(JSContext *ctx, world_t *W, const int *hs, int nh);
handle_t *use(JSContext *ctx, world_t *W, int id, int type, int right);
JSValue ka_fs(JSContext *ctx, world_t *W, int argc, JSValueConst *argv, JSValue *p);

// An operation's name and function; vm_ops.c's table (vm_sys.c has the rest)
typedef struct { const char *name; op_fn fn; } vm_op_t;
extern const vm_op_t VM_OPS[];
extern const size_t VM_N_OPS;

// vm_sys.c: promises, the system operations the async host function needs, and the host functions
int vm_new_promise(world_t *W, JSValue *out);
JSValue ka_spawn(JSContext *ctx, world_t *W, int argc, JSValueConst *argv, JSValue *p);
JSValue host_k(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv);
JSValue host_ka(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv);
