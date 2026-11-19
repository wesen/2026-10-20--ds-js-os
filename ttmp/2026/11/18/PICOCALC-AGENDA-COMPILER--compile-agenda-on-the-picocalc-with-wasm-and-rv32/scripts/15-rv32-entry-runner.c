#include <stdint.h>

typedef struct { uint32_t length; uint16_t units[16]; } token;
typedef struct { token word; int32_t today, date, time; } fixture;

extern const fixture cases_start[], cases_end[];
extern int32_t entryDate(const token *, int32_t);
extern int32_t entryTime(const token *);

void _start(void)
{
    uint32_t passed = 0;
    const fixture *row = cases_start;
    for (; row != cases_end; ++row) {
        if (entryDate(&row->word, row->today) != row->date ||
            entryTime(&row->word) != row->time) break;
        ++passed;
    }
    register int a0 asm("a0") = 1;
    register const void *a1 asm("a1") = &passed;
    register unsigned a2 asm("a2") = sizeof passed;
    register int a7 asm("a7") = 2;
    asm volatile("ecall" : "+r"(a0) : "r"(a1), "r"(a2), "r"(a7) : "memory");
    a0 = row != cases_end;
    a7 = 1;
    asm volatile("ecall" : : "r"(a0), "r"(a7) : "memory");
    __builtin_unreachable();
}
