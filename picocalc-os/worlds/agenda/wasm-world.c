#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "nw.h"
#include "nw_ui.h"

enum { LINE_UNITS = 2048, UTF8_BYTES = 3 * LINE_UNITS + 1 };

typedef struct {
    uint32_t length;
    uint16_t units[LINE_UNITS];
} text_buffer;

typedef struct {
    int32_t done, text_start, due_start, due_end, time_start, date_valid, time_valid;
    int32_t lead_start, lead_end, lead_minutes, title_length;
} task_record;

int parseTask(const void *line, void *title, void *task);

static text_buffer line_buffer, title_buffer;
static char input[UTF8_BYTES], title[UTF8_BYTES];
static int notes, read_token;
static char screen[16384], quoted[UTF8_BYTES + 128], reply[UTF8_BYTES + 256];

// Strict UTF-8 decoding. Offsets in the compiled record count UTF-16 units.
static int decode(const char *text, text_buffer *out)
{
    const unsigned char *p = (const unsigned char *)text;
    out->length = 0;
    while (*p) {
        uint32_t cp = *p++;
        unsigned extra = 0;
        uint32_t minimum = 0;
        if (cp >= 0xf0 && cp <= 0xf4) {
            cp &= 7;
            extra = 3;
            minimum = 0x10000;
        } else if (cp >= 0xe0 && cp <= 0xef) {
            cp &= 15;
            extra = 2;
            minimum = 0x800;
        } else if (cp >= 0xc2 && cp <= 0xdf) {
            cp &= 31;
            extra = 1;
            minimum = 0x80;
        } else if (cp >= 0x80) {
            return 0;
        }
        while (extra--) {
            if ((*p & 0xc0) != 0x80) return 0;
            cp = (cp << 6) | (*p++ & 63);
        }
        if (cp < minimum || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return 0;
        if (out->length + (cp >= 0x10000 ? 2 : 1) > LINE_UNITS) return 0;
        if (cp >= 0x10000) {
            cp -= 0x10000;
            out->units[out->length++] = 0xd800 + (cp >> 10);
            cp = 0xdc00 + (cp & 1023);
        }
        out->units[out->length++] = cp;
    }
    return 1;
}

static void encode_title(const text_buffer *text, unsigned length, char *out)
{
    for (unsigned i = 0; i < length; i++) {
        uint32_t cp = text->units[i];
        if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < length &&
            text->units[i + 1] >= 0xdc00 && text->units[i + 1] <= 0xdfff) {
            cp = 0x10000 + ((cp - 0xd800) << 10) + (text->units[++i] - 0xdc00);
        }
        if (cp >= 0x10000) {
            *out++ = 0xf0 | (cp >> 18);
            *out++ = 0x80 | ((cp >> 12) & 63);
        } else if (cp >= 0x800) {
            *out++ = 0xe0 | (cp >> 12);
        }
        if (cp >= 0x800) *out++ = 0x80 | ((cp >> 6) & 63);
        else if (cp >= 0x80) *out++ = 0xc0 | (cp >> 6);
        *out++ = cp >= 0x80 ? 0x80 | (cp & 63) : cp;
    }
    *out = 0;
}

static int parse_line(const char *source, task_record *task)
{
    if (!decode(source, &line_buffer)) return -1;
    title_buffer.length = LINE_UNITS;
    if (!parseTask(&line_buffer, &title_buffer, task)) return 0;
    if (task->title_length < 0 || task->title_length > LINE_UNITS) return -1;
    encode_title(&title_buffer, (unsigned)task->title_length, title);
    return 1;
}

static void render_file(const nw_event *event)
{
    if (!event->ok) {
        nw_log("Agenda could not read notes/todo.txt");
        return;
    }
    char *text = malloc((size_t)event->json_len + 1);
    if (!text) {
        nw_log("Agenda could not allocate its file buffer");
        return;
    }
    if (nw_json_string(event->json, text, event->json_len + 1) < 0) {
        nw_log("Agenda got a malformed file read");
        free(text);
        return;
    }
    nw_ui ui;
    nw_ui_begin(&ui, screen, sizeof screen - 2); // leave space to close the column
    nw_ui_open(&ui, "col", NULL);
    unsigned shown = 0;
    for (char *line = text; line && shown < 12; ) {
        char *next = strchr(line, '\n');
        if (next) *next++ = '\0';
        task_record task;
        if (parse_line(line, &task) > 0 && !task.done) {
            nw_ui row = ui;
            nw_ui_text(&row, task.title_length ? title : "(untitled)", NULL);
            if (row.bad) break;
            ui = row;
            shown++;
        }
        line = next;
    }
    free(text);
    ui.n = sizeof screen;
    nw_ui_close(&ui);
    if (nw_ui_end(&ui) >= 0) nw_screen(screen, "");
}

void nw_init(void)
{
    nw_kind("app");
    nw_title("Typed Agenda");
    notes = nw_fs_open("fs:/notes");
}

int nw_on_event(const nw_event *event)
{
    if (event->kind == NW_START) {
        if (notes >= 0) read_token = nw_fs_read(notes, "todo.txt");
        if (notes < 0 || read_token < 0) nw_log("Agenda could not start its notes read");
    }
    if (event->kind == NW_SETTLE && read_token > 0 && event->token == read_token) {
        read_token = 0;
        render_file(event);
    }
    if (event->kind != NW_MESSAGE || strcmp(event->type, "agenda.parse") != 0) return NW_DONE;
    // nw_json_str caps its result at n-1. Reserve that value to detect truncation.
    int bytes = nw_json_str(event->json, "line", input, sizeof input);
    task_record task;
    int parsed = bytes < 0 || bytes >= (int)sizeof input - 1 ? -1 : parse_line(input, &task);
    if (parsed < 0) {
        if (event->ask) nw_reject("expected a bounded Agenda line");
        return NW_DONE;
    }
    if (!parsed) {
        if (event->ask) nw_reply("null");
        return NW_DONE;
    }
    const char *label = task.title_length ? title : "(untitled)";
    if (!event->ask) return NW_DONE;
    if (nw_json_quote(quoted, sizeof quoted, label) < 0) {
        nw_reject("Agenda reply exceeds the message buffer");
        return NW_DONE;
    }
    int n = snprintf(reply, sizeof reply, "{\"title\":%s,\"done\":%s,\"dateValid\":%s,\"timeValid\":%s,\"leadMinutes\":%d}",
                     quoted, task.done ? "true" : "false", task.date_valid ? "true" : "false",
                     task.time_valid ? "true" : "false", task.lead_minutes);
    if (n >= 0 && n < (int)sizeof reply) nw_reply(reply);
    else nw_reject("Agenda reply exceeds the message buffer");
    return NW_DONE;
}
