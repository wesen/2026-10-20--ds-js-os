#pragma once
#include <stdint.h>

// Offsets count UTF-16 units. Columns count code points. A logical line is
// a span of this document ending immediately before LF or at document end.
typedef struct {
    uint32_t length;
    uint16_t units[];
} editor_text;

int editorNext(const editor_text *text, int at);
int editorPrevious(const editor_text *text, int at);
int editorWrapEnd(const editor_text *text, int start, int line_end, int width);
int editorColumn(const editor_text *text, int start, int end);
int editorOffset(const editor_text *text, int start, int end, int line_end, int column);
