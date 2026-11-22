/* Promoted from PICOCALC-AGENDA-COMPILER scripts/06-rv32-runner.c (PICOCALC-REPO-LAYOUT Phase A); run from the repository root. */
#include <stdint.h>

enum { UNITS = 120, FIELDS = 11 };
typedef struct { uint32_t length; uint16_t code[UNITS]; } text;
typedef struct {
    text input;
    int32_t valid;
    int32_t record[FIELDS];
    uint16_t title[UNITS];
} fixture;

extern const fixture cases_start[], cases_end[];
extern int parseTask(const text *, text *, int32_t *);
extern int validDate(int, int, int);
extern int leadMinutes(const text *);

static void print(const void *data, unsigned length)
{
    register int a0 asm("a0") = 1;
    register const void *a1 asm("a1") = data;
    register unsigned a2 asm("a2") = length;
    register int a7 asm("a7") = 2;
    asm volatile("ecall" : "+r"(a0) : "r"(a1), "r"(a2), "r"(a7) : "memory");
}

void _start(void)
{
    uint32_t failure = 0, index = 0, calendar = 0, leads = 0;
    for (const fixture *row = cases_start; row != cases_end; row++, index++) {
        text title;
        title.length = UNITS;
        int32_t record[FIELDS];
        int valid = parseTask(&row->input, &title, record);
        if (valid != row->valid) { failure = 1; break; }
        if (!valid) continue;
        for (int i = 0; i < FIELDS; i++) if (record[i] != row->record[i]) failure = 2;
        for (int i = 0; i < row->record[FIELDS - 1]; i++) if (title.code[i] != row->title[i]) failure = 3;
        if (failure) break;
    }
    for (int year = 1996; year <= 2400; year++) {
        int expected = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
        if (validDate(year, 2, 29) != expected) failure = 4;
        calendar++;
    }
    for (int hours = 0; hours <= 9999; hours++) {
        text token;
        token.length = 6;
        token.code[0] = '!';
        token.code[5] = 'h';
        int remaining = hours;
        for (int digit = 4; digit >= 1; digit--) {
            token.code[digit] = '0' + remaining % 10;
            remaining /= 10;
        }
        if (leadMinutes(&token) != hours * 60) failure = 5;
        leads++;
    }
    const uint32_t result[] = {failure, index, calendar, leads};
    print(result, sizeof result);
    register int a0 asm("a0") = failure != 0;
    register int a7 asm("a7") = 1;
    asm volatile("ecall" : : "r"(a0), "r"(a7) : "memory");
    __builtin_unreachable();
}
