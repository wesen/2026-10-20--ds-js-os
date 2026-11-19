#include <stdint.h>
#include <stdbool.h>

// The linker replaces this unreachable body with a call into the emitted module.
__attribute__((export_name("parseTask")))
int parseTask(const void *line, void *title, void *task)
{
    (void)line;
    (void)title;
    (void)task;
    __builtin_trap();
}

__attribute__((export_name("normalizeEntry")))
int normalizeEntry(const void *line, int32_t today, void *output)
{
    (void)line;
    (void)today;
    (void)output;
    __builtin_trap();
}

__attribute__((export_name("agendaDateKey")))
int agendaDateKey(int32_t date, bool done)
{
    (void)date;
    (void)done;
    __builtin_trap();
}

__attribute__((export_name("entryAddDays")))
int entryAddDays(int32_t today, int32_t count)
{
    (void)today;
    (void)count;
    __builtin_trap();
}

__attribute__((export_name("entryWeekday")))
int entryWeekday(int32_t date)
{
    (void)date;
    __builtin_trap();
}
