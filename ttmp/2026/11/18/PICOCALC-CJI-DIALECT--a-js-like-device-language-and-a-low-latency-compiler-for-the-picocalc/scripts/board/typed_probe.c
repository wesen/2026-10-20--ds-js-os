// Ticket firmware includes the production WAMR translation unit so the diagnostic
// shares its allocator, import registration and global runtime initialization.
#include "native_wasm.c"
#include "quickjs.h"
#include "esp_timer.h"
#include "mbedtls/sha256.h"
#include "typed_input.inc"

static unsigned sequence;

static bool js_ok(JSContext *ctx, JSValue value) {
    if (!JS_IsException(value)) return true;
    JSValue err = JS_GetException(ctx);
    const char *message = JS_ToCString(ctx, err);
    printf("DIALECT_TYPED_ERROR js=%s\n", message ? message : "exception");
    if (message) JS_FreeCString(ctx, message);
    JS_FreeValue(ctx, err);
    return false;
}

static int layout_reference(int sel, int count, int visible) {
    if (count <= visible || sel < 0) return 0;
    int offset = sel - visible / 2;
    if (offset > count - visible) offset = count - visible;
    return offset > 0 ? offset : 0;
}

void __wrap_vm_calibrate(void) {
    unsigned trial = sequence++;
    // The boot callback is also used by the normal calibration routine.
    if (!trial) return;
    char err[192] = "";
    int checks = 0, ok = 0;
    size_t size = 0;
    long long setup = -1, compile = -1, load = -1, execute = -1;
    char sha[65] = "";
    JSRuntime *rt = NULL;
    JSContext *ctx = NULL;
    JSValue artifact = JS_UNDEFINED;
    wasm_module_t mod = NULL;
    wasm_module_inst_t inst = NULL;
    wasm_exec_env_t env = NULL;
    int64_t start = esp_timer_get_time();
    rt = JS_NewRuntime();
    if (!rt) goto end;
    JS_SetMemoryLimit(rt, 1024 * 1024);
    JS_SetMaxStackSize(rt, port_js_stack());
    ctx = JS_NewContext(rt);
    if (!ctx) goto end;
    JSValue init = JS_Eval(ctx, emitter, sizeof emitter - 1, "typed-emitter.js", JS_EVAL_TYPE_GLOBAL);
    if (!js_ok(ctx, init)) goto end;
    JS_FreeValue(ctx, init);
    JSValue global = JS_GetGlobalObject(ctx);
    int bound = JS_SetPropertyStr(ctx, global, "inputSource", JS_NewStringLen(ctx, source, sizeof source - 1));
    JS_FreeValue(ctx, global);
    if (bound < 0) goto end;
    int64_t t = esp_timer_get_time();
    setup = t - start;
    const char expr[] = "compileTyped(inputSource).slice().buffer";
    artifact = JS_Eval(ctx, expr, sizeof expr - 1, "compile-layout", JS_EVAL_TYPE_GLOBAL);
    compile = esp_timer_get_time() - t;
    if (!js_ok(ctx, artifact)) goto end;
    uint8_t *bytes = JS_GetArrayBuffer(ctx, &size, artifact);
    if (!bytes || !size) goto end;
    unsigned char digest[32];
    mbedtls_sha256(bytes, size, digest, 0);
    for (int k = 0; k < 32; ++k) snprintf(sha + 2*k, 3, "%02x", digest[k]);
    t = esp_timer_get_time();
    if (!runtime_ready(err, sizeof err)) goto end;
    mod = wasm_runtime_load(bytes, (uint32_t)size, err, sizeof err);
    if (!mod || wasm_runtime_get_import_count(mod) != 0) goto end;
    InstantiationArgs args = { .default_stack_size = STACK_BYTES, .max_memory_pages = 1 };
    inst = wasm_runtime_instantiate_ex(mod, &args, err, sizeof err);
    if (!inst) goto end;
    env = wasm_runtime_create_exec_env(inst, STACK_BYTES);
    if (!env) goto end;
    wasm_function_inst_t scroll = wasm_runtime_lookup_function(inst, "scrollStart");
    if (!scroll) goto end;
    load = esp_timer_get_time() - t;
    t = esp_timer_get_time();
    for (int count = 0; count <= 16; count += 2) {
        for (int visible = 1; visible <= 7; visible += 2) {
            for (int sel = -1; sel <= count + 1; ++sel) {
                uint32_t argv[] = { (uint32_t)sel, (uint32_t)count, (uint32_t)visible };
                wasm_runtime_set_instruction_count_limit(env, 1000);
                if (!wasm_runtime_call_wasm(env, scroll, 3, argv)) goto end;
                if ((int32_t)argv[0] != layout_reference(sel, count, visible)) goto end;
                checks++;
            }
        }
    }
    execute = esp_timer_get_time() - t;
    ok = 1;
end:
    printf("DIALECT_TYPED trial=%u ok=%d bytes=%u sha=%s setup_us=%lld compile_us=%lld load_us=%lld exec_us=%lld checks=%d detail=%s\n",
           trial, ok, (unsigned)size, sha, setup, compile, load, execute, checks, err);
    if (env) wasm_runtime_destroy_exec_env(env);
    if (inst) wasm_runtime_deinstantiate(inst);
    if (mod) wasm_runtime_unload(mod);
    if (ctx) { JS_FreeValue(ctx, artifact); JS_FreeContext(ctx); }
    if (rt) JS_FreeRuntime(rt);
}
