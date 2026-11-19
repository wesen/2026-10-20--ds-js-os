#define SLOT(name, ...) __attribute__((export_name(#name))) \
    int name(__VA_ARGS__) { __builtin_trap(); }
SLOT(typedWorldMeta, int field, void *value)
SLOT(typedWorldEvent, int kind, void *screen, void *hints)
