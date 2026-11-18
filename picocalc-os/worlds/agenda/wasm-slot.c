#include <stdint.h>

// The linker replaces this unreachable body with a call into the emitted module.
__attribute__((export_name("parseTask")))
int parseTask(const void *line, void *title, void *task)
{
    (void)line;
    (void)title;
    (void)task;
    __builtin_trap();
}
