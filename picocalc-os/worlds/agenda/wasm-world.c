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
enum { MINUTE_MS = 60000, DAY_MS = 86400000, REMINDER_WINDOW = 2 * 3600000,
       LATE_MS = 120000, STORE_CAPACITY = 16384, FIRED_MAX = 200 };
static int notes, read_token, refresh_timer;
static char stored[STORE_CAPACITY + 1], pending_store[STORE_CAPACITY + 1];
static char reminder_key[UTF8_BYTES + 32], quoted_key[6 * LINE_UNITS + 48];
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

static int decimal_at(unsigned start, unsigned count)
{
    int value = 0;
    for (unsigned i = 0; i < count; i++) value = value * 10 + line_buffer.units[start + i] - '0';
    return value;
}

static int64_t days_before_year(int year)
{
    int previous = year - 1;
    return (int64_t)previous * 365 + previous / 4 - previous / 100 + previous / 400;
}

// Agenda's Date constructor evaluates the time zone at the nominal UTC instant.
static int64_t due_ms(const task_record *task, char time_text[6])
{
    static const int before_month[] = { 0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334 };
    if (task->due_start < 0 || (uint64_t)task->due_start + 11 > line_buffer.length ||
        task->time_start < 0 || (uint64_t)task->time_start + 5 > line_buffer.length) return INT64_MIN;
    int year = decimal_at(task->due_start + 1, 4);
    int month = decimal_at(task->due_start + 6, 2);
    int day = decimal_at(task->due_start + 9, 2);
    if (year < 100) year += 1900;
    int hour = decimal_at(task->time_start, 2);
    int minute = decimal_at(task->time_start + 3, 2);
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 ||
        minute < 0 || minute > 59) return INT64_MIN;
    int64_t days = days_before_year(year) - days_before_year(1970) + before_month[month - 1] + day - 1;
    if (month > 2 && days_before_year(year + 1) - days_before_year(year) == 366) days++;
    int64_t nominal = days * DAY_MS + (hour * 60 + minute) * MINUTE_MS;
    int offset;
    if (nw_clock_offset(nominal, &offset) < 0) return INT64_MIN;
    for (unsigned i = 0; i < 5; i++) time_text[i] = (char)line_buffer.units[task->time_start + i];
    time_text[5] = 0;
    return nominal - offset * MINUTE_MS;
}

static int remember(const char *key, int64_t now)
{
    int key_len = nw_json_quote(quoted_key, sizeof quoted_key, key);
    if (key_len < 0) return 0;
    const char *old = nw_json_find(stored, "fired");
    if (old && *old == '{') {
        // The SDK lookup compares the escaped property spelling as stored.
        quoted_key[key_len - 1] = 0;
        int exists = nw_json_find(old, quoted_key + 1) != NULL;
        quoted_key[key_len - 1] = '"';
        if (exists) return 0;
    }
    int length = snprintf(pending_store, sizeof pending_store, "{\"fired\":{%s:%lld", quoted_key, (long long)now);
    if (length < 0 || length > STORE_CAPACITY - 2) return 0;
    if (old && *old == '{') {
        const char *entry = nw_json__ws(old + 1);
        for (int count = 1; count < FIRED_MAX && *entry == '"'; ) {
            const char *colon = nw_json__skip(entry, 0);
            if (!colon || *colon != ':') break;
            char *end;
            int64_t fired_at = strtoll(colon + 1, &end, 10);
            if (end == colon + 1 || (*end != ',' && *end != '}')) break;
            size_t len = (size_t)(end - entry);
            if (fired_at >= now - 2LL * DAY_MS) {
                if ((size_t)length + 1 + len + 2 > STORE_CAPACITY) break;
                pending_store[length++] = ',';
                memcpy(pending_store + length, entry, len);
                length += (int)len;
                count++;
            }
            if (*end != ',') break;
            entry = nw_json__ws(end + 1);
        }
    }
    memcpy(pending_store + length, "}}", 3);
    if (nw_store_save(pending_store) < 0) {
        nw_log("Agenda could not save the fired reminders");
        return 0;
    }
    memcpy(stored, pending_store, (size_t)length + 3);
    return 1;
}

static void remind(const task_record *task, const char *label, int64_t now)
{
    if (now < 0 || !task->time_valid) return;
    char time_text[6];
    int64_t due = due_ms(task, time_text);
    if (due == INT64_MIN) return;
    int64_t fire = due - (task->lead_minutes > 0 ? task->lead_minutes * (int64_t)MINUTE_MS : 0);
    if (fire > now || now - fire > REMINDER_WINDOW) return;
    int n = snprintf(reminder_key, sizeof reminder_key, "%lld|%s", (long long)fire, label);
    if (n < 0 || n >= (int)sizeof reminder_key) return;
    // The JSON and UTF-8 buffers are separate so the title is escaped once.
    n = snprintf(input, sizeof input, "%s at %s", label, time_text);
    if (n < 0 || n >= (int)sizeof input || nw_json_quote(quoted, sizeof quoted, input) < 0) return;
    char sub[48] = "now";
    int late = now - fire > LATE_MS;
    if (late) snprintf(sub, sizeof sub, "was due at %s", time_text);
    if (task->lead_minutes > 0 &&
        task->lead_start >= 0 && task->lead_end > task->lead_start &&
        task->lead_end - task->lead_start <= 6 && (unsigned)task->lead_end <= line_buffer.length) {
        if (late) strcat(sub, " less ");
        else memcpy(sub, "in ", 4);
        // Lead offsets count UTF-16 units and the lead token is ASCII.
        size_t len = strlen(sub);
        for (int at = task->lead_start + 1; at < task->lead_end; at++) {
            uint16_t code = line_buffer.units[at];
            if ((code < '0' || code > '9') && code != 'm' && code != 'h' && code != 'd') return;
            sub[len++] = (char)code;
        }
        sub[len] = 0;
    }
    n = snprintf(reply, sizeof reply, "{\"text\":%s,\"sub\":\"%s\"}", quoted, sub);
    if (n >= 0 && n < (int)sizeof reply && remember(reminder_key, now))
        nw_send("compositor", "notify", reply);
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
    int64_t wall = nw_clock_wall();
    for (char *line = text; line; ) {
        char *next = strchr(line, '\n');
        if (next) *next++ = '\0';
        task_record task;
        if (parse_line(line, &task) > 0 && !task.done) {
            const char *label = task.title_length ? title : "(untitled)";
            remind(&task, label, wall);
            if (shown < 12) {
                nw_ui row = ui;
                nw_ui_text(&row, label, NULL);
                if (row.bad) shown = 12;
                else { ui = row; shown++; }
            }
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
    refresh_timer = nw_every(15000);
}

int nw_on_event(const nw_event *event)
{
    if (event->kind == NW_START && nw_store_load(stored, sizeof stored) < 0) stored[0] = 0;
    if ((event->kind == NW_START || (event->kind == NW_TICK && event->timer == refresh_timer)) && !read_token) {
        if (notes >= 0) read_token = nw_fs_read(notes, "todo.txt");
        if (notes < 0 || read_token < 0) {
            read_token = 0;
            nw_log("Agenda could not start its notes read");
        }
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
