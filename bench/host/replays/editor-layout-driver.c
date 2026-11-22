/* Promoted from PICOCALC-TYPED-APPS scripts/07-editor-layout-driver.c (PICOCALC-REPO-LAYOUT Phase A); run from the repository root. */
#include <stdint.h>
#include <stdio.h>

#include "layout.h"

#include "fixtures.inc"

int main(void)
{
    const unsigned count = sizeof vectors / sizeof vectors[0];
    for (unsigned i = 0; i < count; i++) {
        const int *test = vectors[i];
        const editor_text *line = lines[test[0]];
        int actual;
        switch (test[1]) {
        case 0: actual = editorNext(line, test[2]); break;
        case 1: actual = editorPrevious(line, test[2]); break;
        case 2: actual = editorWrapEnd(line, test[2], test[3], test[4]); break;
        case 3: actual = editorColumn(line, test[2], test[3]); break;
        case 4: actual = editorOffset(line, test[2], test[3], test[4], test[5]); break;
        default: return 2;
        }
        if (actual != test[6]) {
            printf("vector %u, operation %d: got %d, expected %d\n", i, test[1], actual, test[6]);
            return 1;
        }
    }
    printf("%u editor layout vectors passed\n", count);
    return 0;
}
