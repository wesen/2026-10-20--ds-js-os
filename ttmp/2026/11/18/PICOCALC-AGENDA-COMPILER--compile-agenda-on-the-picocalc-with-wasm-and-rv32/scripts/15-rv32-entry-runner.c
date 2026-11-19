#include <stdint.h>

typedef struct { uint32_t length; uint16_t units[16]; } token;
typedef struct { token word; int32_t today, date, time; } fixture;
typedef struct { uint32_t length; uint16_t units[160]; } prompt;
typedef struct { int32_t start, end; } entry_error;
typedef struct { prompt input, expected; int32_t today, result, capacity; entry_error error; } prompt_fixture;

extern const fixture cases_start[], cases_end[];
extern const prompt_fixture prompts_start[], prompts_end[];
extern int32_t entryDate(const token *, int32_t);
extern int32_t entryTime(const token *);
extern int32_t normalizeEntry(const prompt *, int32_t, prompt *, entry_error *);

void _start(void)
{
    uint32_t passed = 0;
    const fixture *row = cases_start;
    for (; row != cases_end; ++row) {
        if (entryDate(&row->word, row->today) != row->date ||
            entryTime(&row->word) != row->time) break;
        ++passed;
    }
    uint32_t prompts = 0;
    const prompt_fixture *edit = prompts_start;
    for (; edit != prompts_end; ++edit) {
        prompt output;
        output.length = edit->capacity;
        entry_error error = {-1, -1};
        int32_t result = normalizeEntry(&edit->input, edit->today, &output, &error);
        if (result != edit->result) break;
        if (error.start != edit->error.start || error.end != edit->error.end) break;
        int32_t i = 0;
        while (i < result && output.units[i] == edit->expected.units[i]) ++i;
        if (result >= 0 && i != result) break;
        ++prompts;
    }
    uint32_t counts[2] = {passed, prompts};
    register int a0 asm("a0") = 1;
    register const void *a1 asm("a1") = counts;
    register unsigned a2 asm("a2") = sizeof counts;
    register int a7 asm("a7") = 2;
    asm volatile("ecall" : "+r"(a0) : "r"(a1), "r"(a2), "r"(a7) : "memory");
    a0 = row != cases_end || edit != prompts_end;
    a7 = 1;
    asm volatile("ecall" : : "r"(a0), "r"(a7) : "memory");
    __builtin_unreachable();
}
