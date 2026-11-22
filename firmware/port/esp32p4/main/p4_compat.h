// Forced include for the device build. QuickJS's default allocator wants malloc_usable_size(), which
// ESP-IDF's newlib provides but does not declare.
#pragma once
#include <stddef.h>
#ifdef __cplusplus
extern "C" {
#endif
size_t malloc_usable_size(void *ptr);
#ifdef __cplusplus
}
#endif
