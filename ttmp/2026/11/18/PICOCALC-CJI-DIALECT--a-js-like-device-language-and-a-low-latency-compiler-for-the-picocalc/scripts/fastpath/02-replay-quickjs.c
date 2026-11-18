/* Link only into an experimental host binary. The compiled-in files come from
 * trusted catalog source and the exact same QuickJS engine build as this host.
 */
#include <stdio.h>
#include <string.h>

#include "quickjs.h"
#include "quickjs-catalog.inc"

JSValue __real_JS_Eval(JSContext *, const char *, size_t, const char *, int);

JSValue __wrap_JS_Eval(JSContext *ctx, const char *source, size_t len, const char *name, int flags)
{
    if (flags == JS_EVAL_TYPE_GLOBAL && strcmp(name, "calibrate.js")) {
        for (size_t i = 0; i < sizeof catalog / sizeof *catalog; i++) {
            const CatalogEntry *entry = &catalog[i];
            if (strcmp(name, entry->name))
                continue;
            if (len != entry->source_size || memcmp(source, entry->source, len))
                return JS_ThrowInternalError(ctx, "source changed for catalog entry %s", name);

            JSValue code = JS_ReadObject(ctx, entry->bytecode, entry->bytecode_size, JS_READ_OBJ_BYTECODE);
            if (JS_IsException(code))
                return code;
            if (JS_VALUE_GET_TAG(code) != JS_TAG_FUNCTION_BYTECODE) {
                JS_FreeValue(ctx, code);
                return JS_ThrowInternalError(ctx, "expected global script bytecode for %s", name);
            }
            fprintf(stderr, "fastpath loaded %s (%zu bytes)\n", name, entry->bytecode_size);
            return JS_EvalFunction(ctx, code);
        }
        return JS_ThrowInternalError(ctx, "missing trusted catalog bytecode for %s", name);
    }
    return __real_JS_Eval(ctx, source, len, name, flags);
}
