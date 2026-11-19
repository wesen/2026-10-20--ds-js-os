#include <stdint.h>
#include <stdbool.h>
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
int normalizeEntry(const void *line, int32_t local_date, void *output);
int agendaDateKey(int32_t date, bool done);
int entryAddDays(int32_t date, int32_t count);
int entryWeekday(int32_t date);
int agendaMark(bool done, bool toggle);

static text_buffer line_buffer, title_buffer;
static char input[UTF8_BYTES], title[UTF8_BYTES];
enum { MINUTE_MS = 60000, DAY_MS = 86400000, REMINDER_WINDOW = 2 * 3600000,
       LATE_MS = 120000, STORE_CAPACITY = 16384, FIRED_MAX = 200 };
static int notes, read_token, refresh_timer;
static char stored[STORE_CAPACITY + 1], pending_store[STORE_CAPACITY + 1];
static char reminder_key[UTF8_BYTES + 32], quoted_key[6 * LINE_UNITS + 48];
static char screen[16384], quoted[UTF8_BYTES + 128], reply[UTF8_BYTES + 256];
enum { INPUT_KEYS = 120, FILE_LIMIT = 65536 };
typedef enum { NO_CHANGE, ADD_TASK, EDIT_TASK, TOGGLE_TASK, DELETE_TASK } task_change;
static char prompt[UTF8_BYTES], new_task[UTF8_BYTES], original[UTF8_BYTES];
static task_change prompt_kind, pending_change;
static unsigned prompt_units;
static bool confirming;
static int edit_read, edit_write;
enum { UNDATED = 100000000, COMPLETED, OVERDUE = -1, VIEW_ROWS = 25, VIEW_CHARS = 80 };
typedef struct {
    int32_t date_key;
    int16_t minute;
    uint16_t offset, row;
} agenda_item;
static char *snapshot;
static agenda_item *items;
static int item_count, open_count, visible_count, selected = -1, today = -1, tomorrow = -1;
static bool show_done;
static char view_note[4 * VIEW_CHARS + 32], view_error[128];
static const char prompt_help[] = "@today @tue @+3d @11-15  14:30 or 2pm  !15m before";

static void publish_view(void);

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

static int task_date(const task_record *task)
{
    if (!task->date_valid) return -1;
    int at = task->due_start;
    return decimal_at(at + 1, 4) * 10000 + decimal_at(at + 6, 2) * 100 + decimal_at(at + 9, 2);
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

static bool file_missing(const nw_event *event)
{
    char error[128];
    return !event->ok && nw_json_string(event->json, error, sizeof error) >= 0 &&
           !strncmp(error, "no file ", 8);
}

static int compare_items(const void *a, const void *b)
{
    const agenda_item *left = a, *right = b;
    if (left->date_key != right->date_key) return left->date_key - right->date_key;
    if (left->date_key < UNDATED && left->minute != right->minute) return left->minute - right->minute;
    return (int)left->offset - (int)right->offset;
}

static int group_of(const agenda_item *item)
{
    return item->date_key < today ? OVERDUE : item->date_key;
}

static int selected_row(void)
{
    return selected >= 0 ? items[selected].row : snapshot ? -1 : 0;
}

static void layout_items(int old_row)
{
    int date = nw_clock_today();
    if (date != today) {
        today = date;
        tomorrow = today < 0 ? -1 : entryAddDays(today, 1);
    }
    visible_count = show_done ? item_count : open_count;
    int group = 0, row = 0;
    selected = -1;
    for (int i = 0; i < visible_count; i++) {
        int next_group = group_of(&items[i]);
        if (i == 0 || next_group != group) row++;
        group = next_group;
        items[i].row = row++;
        if (old_row >= 0 && selected < 0 && items[i].row >= old_row) selected = i;
    }
    if (old_row >= 0 && selected < 0) selected = visible_count - 1;
}

static void short_date(char *out, size_t size, int date, bool upper, bool full_day)
{
    static const char *const short_days[] = {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"};
    static const char *const long_days[] = {"Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"};
    static const char *const months[] = {"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"};
    int weekday = entryWeekday(date);
    snprintf(out, size, "%s %d %s", (full_day ? long_days : short_days)[weekday], date % 100,
             months[date / 100 % 100 - 1]);
    if (upper) for (char *p = out; *p; p++) if (*p >= 'a' && *p <= 'z') *p -= 'a' - 'A';
}

static void render_header(nw_ui *ui, int group)
{
    char day[32], label[64];
    const char *name = label;
    if (group == OVERDUE) name = "OVERDUE";
    else if (group == UNDATED) name = "NO DATE";
    else if (group == COMPLETED) name = "DONE";
    else {
        short_date(day, sizeof day, group, true, group == today);
        if (group == today) snprintf(label, sizeof label, "TODAY · %s", day);
        else if (group == tomorrow) snprintf(label, sizeof label, "TOMORROW · %s", day);
        else if (today < 0 || group / 10000 != today / 10000) snprintf(label, sizeof label, "%s %d", day, group / 10000);
        else snprintf(label, sizeof label, "%s", day);
    }
    nw_ui__raw(ui, "{\"label\":");
    nw_ui_str(ui, name);
    nw_ui__raw(ui, ",\"color\":\"accent\"}");
}

// The panel clips at fewer than VIEW_CHARS glyphs. Truncate on a UTF-8 boundary
// so the visible window always fits the kernel's screen-message buffer.
static void clip_label(char *label)
{
    unsigned count = 0;
    for (unsigned char *p = (unsigned char *)label; *p; p++) {
        if ((*p & 0xc0) != 0x80 && count++ == VIEW_CHARS) { *p = 0; return; }
    }
}

static const char *prompt_tail(void)
{
    const unsigned char *start = (const unsigned char *)prompt;
    const unsigned char *p = start + strlen(prompt);
    int count = 0;
    while (p > start && count < VIEW_CHARS) {
        p--;
        if ((*p & 0xc0) != 0x80) count++;
    }
    return (const char *)p;
}

static void render_item(nw_ui *ui, const agenda_item *item)
{
    task_record task;
    if (parse_line(snapshot + item->offset, &task) != 1) return;
    const char *label = task.title_length ? title : "(untitled)";
    clip_label(title);
    char right[32] = "";
    int date = task_date(&task);
    bool overdue = today >= 0 && date >= 0 && date < today;
    if (overdue) short_date(right, sizeof right, date, false, false);
    else if (task.lead_start >= 0 && task.lead_end - task.lead_start < (int)sizeof right) {
        int len = task.lead_end - task.lead_start;
        for (int i = 0; i < len; i++) right[i] = (char)line_buffer.units[task.lead_start + i];
    }
    char timed[4 * VIEW_CHARS + 16];
    if (item->minute >= 0) {
        int prefix = snprintf(timed, sizeof timed, "%02d:%02d  ", item->minute / 60, item->minute % 60);
        memcpy(timed + prefix, label, strlen(label) + 1);
    }
    nw_ui__raw(ui, "{\"label\":");
    nw_ui_str(ui, item->minute >= 0 ? timed : label);
    nw_ui__raw(ui, task.done ? ",\"icon\":\"✓\",\"iconColor\":\"muted\",\"color\":\"muted\"" :
                              ",\"icon\":\"·\",\"iconColor\":\"ink\",\"color\":\"\"");
    nw_ui__raw(ui, ",\"right\":");
    nw_ui_str(ui, right);
    nw_ui__raw(ui, overdue ? ",\"rightColor\":\"accent\"}" : ",\"rightColor\":\"muted\"}");
}

static void publish_view(void)
{
    nw_ui ui;
    nw_ui_begin(&ui, screen, sizeof screen);
    nw_ui_open(&ui, "col", "\"gap\":4");
    if (visible_count) {
        int total = items[visible_count - 1].row + 1;
        int row = selected >= 0 ? items[selected].row : -1;
        int first = row - VIEW_ROWS / 2;
        if (first > total - VIEW_ROWS) first = total - VIEW_ROWS;
        if (first < 0) first = 0;
        int last = first + VIEW_ROWS - 1;
        int index = selected < 0 ? 0 : selected;
        while (index > 0 && items[index - 1].row >= first) index--;
        char list[160];
        snprintf(list, sizeof list, "{\"t\":\"list\",\"font\":\"s\",\"lead\":6,\"grow\":1,\"sel\":%d,"
                 "\"windowStart\":%d,\"totalItems\":%d,\"items\":[", row - first, first, total);
        nw_ui_node(&ui, list);
        for (int i = index; i < visible_count && items[i].row <= last + 1; i++) {
            const agenda_item *item = &items[i];
            bool header = item->row > first && (i == 0 || item->row > items[i - 1].row + 1);
            if (item->row > last && !header) break;
            if (i != index) nw_ui__raw(&ui, ",");
            if (header) {
                render_header(&ui, group_of(item));
                if (item->row > last) break;
                nw_ui__raw(&ui, ",");
            }
            render_item(&ui, item);
        }
        nw_ui__raw(&ui, "]}");
    } else {
        nw_ui_text(&ui, view_error[0] ? "" : "No tasks. F2 adds one, like: dentist @tue 14:30 !15m",
                   "\"font\":\"s\",\"color\":\"muted\",\"wrap\":true,\"grow\":1");
    }
    if (prompt_kind) {
        nw_ui_node(&ui, prompt_kind == ADD_TASK ?
            "{\"t\":\"input\",\"prompt\":\"New: \",\"font\":\"s\",\"value\":" :
            "{\"t\":\"input\",\"prompt\":\"Edit: \",\"font\":\"s\",\"value\":");
        nw_ui_str(&ui, prompt_tail());
        nw_ui__raw(&ui, "}");
    } else nw_ui_node(&ui, "{\"t\":\"gap\",\"h\":0}");
    char status[160];
    char zone[64] = "clock not set: reminders wait";
    if (today >= 0 && nw_clock_zone(zone, sizeof zone) >= 0) {
        char *rule = strchr(zone, ',');
        if (rule) *rule = 0;
    }
    snprintf(status, sizeof status, "%s · %d open · %d done", zone, open_count, item_count - open_count);
    nw_ui_text(&ui, view_note[0] ? view_note : view_error[0] ? view_error : prompt_kind ? prompt_help : status,
               view_note[0] || view_error[0] ? "\"font\":\"s\",\"color\":\"accent\"" : "\"font\":\"s\",\"color\":\"muted\"");
    nw_ui_close(&ui);
    if (nw_ui_end(&ui) >= 0) nw_screen(screen, prompt_kind ? "Enter ok  Esc cancel" : "⏎ tick F2 add F3 edit F4 all F5 del");
}

static int file_capacity(const nw_event *event)
{
    if (!event->ok) return file_missing(event) ? 1 : 0;
    return event->json_len > FILE_LIMIT ? FILE_LIMIT + 2 : event->json_len + 1;
}

static int decode_file(const nw_event *event, char *text, int capacity)
{
    if (event->ok) return nw_json_string(event->json, text, capacity);
    text[0] = 0;
    return 0;
}

// Takes ownership of the mutable buffer, including on allocation failure.
static void publish_file(char *text)
{
    // Count candidates before allocating. Ordinary notes lines consume no item
    // entries, and the retained text gives edits a byte-exact source line.
    int candidates = 0;
    int64_t wall = nw_clock_wall();
    for (const char *p = text; (p = strstr(p, "- ")); ) {
        candidates++;
        p = strchr(p, '\n');
        if (!p) break;
        p++;
    }
    agenda_item *parsed = candidates ? malloc((size_t)candidates * sizeof *parsed) : NULL;
    if (candidates && !parsed) {
        nw_log("Agenda could not allocate its task list");
        free(text);
        return;
    }
    int count = 0, open = 0;
    for (char *line = text, *next; line; line = next) {
        next = strchr(line, '\n');
        if (next) *next++ = 0;
        task_record task;
        if (parse_line(line, &task) != 1) continue;
        int date = task_date(&task);
        int minute = task.time_valid ? decimal_at(task.time_start, 2) * 60 + decimal_at(task.time_start + 3, 2) : -1;
        parsed[count++] = (agenda_item){agendaDateKey(date, task.done), minute, (uint16_t)(line - text), 0};
        if (!task.done) {
            open++;
            remind(&task, task.title_length ? title : "(untitled)", wall);
        }
    }
    if (count > 1) qsort(parsed, count, sizeof *parsed, compare_items);
    int old_row = selected_row();
    free(items);
    free(snapshot);
    snapshot = text;
    items = parsed;
    item_count = count;
    open_count = open;
    layout_items(old_row);
    view_error[0] = 0;
    publish_view();
}

static void render_file(const nw_event *event)
{
    int capacity = file_capacity(event);
    char *text = capacity ? malloc(capacity) : NULL;
    if (text) {
        int length = decode_file(event, text, capacity);
        if (length >= 0 && length <= FILE_LIMIT) { publish_file(text); return; }
        free(text);
    }
    nw_log("Agenda could not read notes/todo.txt");
    snprintf(view_error, sizeof view_error, "Could not read notes/todo.txt");
    publish_view();
}

static void prompt_view(const char *status)
{
    snprintf(view_note, sizeof view_note, "%s", status);
    publish_view();
}

static void request_file(void)
{
    if (read_token || edit_read || edit_write) return;
    if (notes < 0) { nw_log("Agenda could not start its notes read"); return; }
    read_token = nw_fs_read(notes, "todo.txt");
    if (read_token < 0) {
        read_token = 0;
        nw_log("Agenda could not start its notes read");
    }
}

static void request_change(task_change change)
{
    edit_read = notes >= 0 ? nw_fs_read(notes, "todo.txt") : -1;
    if (edit_read < 0) {
        edit_read = 0;
        prompt_view("Could not read notes/todo.txt");
        return;
    }
    pending_change = change;
    // An earlier refresh cannot publish a stale snapshot during this change.
    read_token = 0;
}

static void start_save(void)
{
    static const char *const diagnostics[] = {
        "one date per task", "the clock is not set: write the date as @YYYY-MM-DD",
        "unknown date", "not a time", "a reminder is like !15m, !2h or !1d",
        "a task needs some words", "the normalized task is too long",
    };
    if (!decode(prompt, &line_buffer)) return;
    title_buffer.length = LINE_UNITS;
    int length = normalizeEntry(&line_buffer, nw_clock_today(), &title_buffer);
    if (length < 0) {
        if (length >= -7) prompt_view(diagnostics[-length - 1]);
        return;
    }
    if (length > LINE_UNITS) { prompt_view("the normalized task is too long"); return; }
    encode_title(&title_buffer, (unsigned)length, new_task);
    task_change change = prompt_kind;
    prompt_kind = NO_CHANGE;
    view_note[0] = 0;
    request_change(change);
}

static char *find_line(char *file, const char *line, char **end)
{
    size_t length = strlen(line);
    while (*file) {
        char *p = strchr(file, '\n');
        if (!p) p = file + strlen(file);
        if ((size_t)(p - file) == length && !memcmp(file, line, length)) {
            *end = p;
            return file;
        }
        if (!*p) break;
        file = p + 1;
    }
    return NULL;
}

// scanTask established that this line starts with indentation and an ASCII marker.
static int marker_width(const task_record *task)
{
    return line_buffer.units[task->text_start - 2] == ']' ? 6 : 2;
}

static void change_file(const nw_event *event)
{
    int capacity = file_capacity(event);
    if (!capacity) {
        prompt_view("Could not read notes/todo.txt");
        return;
    }
    size_t task_bytes = strlen(new_task);
    size_t extra = pending_change == ADD_TASK || pending_change == EDIT_TASK ? task_bytes + 8 : 4;
    char *file = malloc((size_t)capacity + extra);
    if (!file) { prompt_view("Could not allocate the file edit"); return; }
    int length = decode_file(event, file, capacity);
    if (length < 0 || length > FILE_LIMIT) goto cannot_save;
    char *eof = file + length;
    char *end = eof;
    char *line = pending_change == ADD_TASK ? eof : find_line(file, original, &end);
    if (!line) {
        snprintf(view_note, sizeof view_note, "todo.txt changed meanwhile; reloaded.");
        publish_file(file);
        return;
    }
    if (pending_change == DELETE_TASK) {
        if (*end == '\n') end++;
        else if (line > file) line--; // removing the last line removes its preceding separator
        memmove(line, end, (size_t)(eof - end) + 1);
    } else {
        char marker[] = "- [ ] ";
        char *start = line;
        if (pending_change == ADD_TASK) {
            if (line > file && line[-1] != '\n') start++;
        } else {
            task_record task;
            if (parse_line(original, &task) != 1) goto cannot_save;
            start = strstr(line, "- ");
            marker[3] = (char)agendaMark(task.done, pending_change == TOGGLE_TASK);
            if (pending_change == TOGGLE_TASK) {
                if (marker_width(&task) == 6) start[3] = marker[3];
                else {
                    memmove(start + 6, start + 2, (size_t)(eof - (start + 2)) + 1);
                    memcpy(start, marker, 6);
                }
            }
        }
        if (pending_change == ADD_TASK || pending_change == EDIT_TASK) {
            size_t inserted = 6 + task_bytes;
            char *tail = start + inserted;
            memmove(tail + (pending_change == ADD_TASK), end, (size_t)(eof - end) + 1);
            if (pending_change == ADD_TASK && start != line) *line = '\n';
            memcpy(start, marker, 6);
            memcpy(start + 6, new_task, task_bytes);
            if (pending_change == ADD_TASK) *tail = '\n';
        }
    }
    if (strlen(file) > FILE_LIMIT) goto cannot_save;
    edit_write = nw_fs_write(notes, "todo.txt", file);
    if (edit_write < 0) {
        edit_write = 0;
        goto cannot_save;
    }
    free(file);
    return;

cannot_save:
    free(file);
    prompt_view("Could not save notes/todo.txt");
}

static void key_event(const char *json)
{
    if (edit_read || edit_write) return;
    char key[24], state[12], ch[8];
    if (nw_json_str(json, "key", key, sizeof key) < 0 ||
        nw_json_str(json, "state", state, sizeof state) < 0 || !strcmp(state, "up")) return;
    bool once = strcmp(state, "hold") != 0;
    if (!prompt_kind) {
        bool delete_key = once && !strcmp(key, "f5");
        if (!delete_key) confirming = false;
        bool had_note = view_note[0] != 0;
        view_note[0] = 0;
        const char *line = selected >= 0 ? snapshot + items[selected].offset : NULL;
        if (once && !strcmp(key, "f2")) {
            prompt_kind = ADD_TASK;
            prompt[0] = 0;
            prompt_units = 0;
            publish_view();
        } else if (once && line && !strcmp(key, "f3")) {
            task_record task;
            if (parse_line(line, &task) != 1) return;
            const char *content = strstr(line, "- ") + marker_width(&task);
            strcpy(original, line);
            strcpy(prompt, content);
            prompt_units = line_buffer.length - task.text_start;
            prompt_kind = EDIT_TASK;
            publish_view();
        } else if (once && line && (!strcmp(key, "enter") || !strcmp(key, "space"))) {
            strcpy(original, line);
            request_change(TOGGLE_TASK);
        } else if (delete_key && line) {
            if (confirming && !strcmp(original, line)) {
                confirming = false;
                request_change(DELETE_TASK);
            } else {
                task_record task;
                if (parse_line(line, &task) != 1) return;
                strcpy(original, line);
                confirming = true;
                clip_label(title);
                snprintf(view_note, sizeof view_note, "F5 again deletes: %.*s", 4 * VIEW_CHARS,
                         task.title_length ? title : "(untitled)");
                publish_view();
            }
        } else if (once && !strcmp(key, "f4")) {
            show_done = !show_done;
            layout_items(selected_row());
            publish_view();
        } else if (!strcmp(key, "up")) {
            if (selected > 0) selected--;
            else if (selected < 0 && visible_count) selected = 0;
            publish_view();
        } else if (!strcmp(key, "down")) {
            if (selected + 1 < visible_count) selected++;
            publish_view();
        } else if (had_note) publish_view();
        return;
    }
    if (once && !strcmp(key, "esc")) {
        prompt_kind = NO_CHANGE;
        prompt_view("");
        return;
    }
    if (once && !strcmp(key, "enter")) { start_save(); return; }
    size_t len = strlen(prompt);
    if (!strcmp(key, "backspace")) {
        if (len) {
            while (((unsigned char)prompt[--len] & 0xc0) == 0x80) {}
            prompt_units -= (unsigned char)prompt[len] >= 0xf0 ? 2 : 1;
            prompt[len] = 0;
        }
    } else if (prompt_units < INPUT_KEYS && nw_json_str(json, "ch", ch, sizeof ch) == 1 &&
               ch[0] >= 32 && ch[0] <= 126) {
        prompt[len] = ch[0];
        prompt[len + 1] = 0;
        prompt_units++;
    } else return;
    publish_view();
}

void nw_init(void)
{
    nw_kind("app");
    nw_title("Typed Agenda");
    nw_key("t");
    notes = nw_fs_open("fs:/notes");
    refresh_timer = nw_every(15000);
}

int nw_on_event(const nw_event *event)
{
    if (event->kind == NW_START && nw_store_load(stored, sizeof stored) < 0) stored[0] = 0;
    if (event->kind == NW_START || (event->kind == NW_TICK && event->timer == refresh_timer)) request_file();
    if (event->kind == NW_SETTLE && edit_read && event->token == edit_read) {
        edit_read = 0;
        change_file(event);
        return NW_DONE;
    }
    if (event->kind == NW_SETTLE && edit_write && event->token == edit_write) {
        edit_write = 0;
        if (event->ok) {
            if (pending_change == ADD_TASK || pending_change == DELETE_TASK)
                snprintf(view_note, sizeof view_note, "%s", pending_change == ADD_TASK ? "Added." : "Deleted.");
            request_file();
        }
        else prompt_view("Could not save notes/todo.txt");
        return NW_DONE;
    }
    if (event->kind == NW_SETTLE && read_token > 0 && event->token == read_token) {
        read_token = 0;
        render_file(event);
    }
    if (event->kind != NW_MESSAGE) return NW_DONE;
    if (!strcmp(event->from, "compositor")) {
        if (!strcmp(event->type, "key")) key_event(event->json);
        if (!strcmp(event->type, "focus")) request_file();
    }
    if (strcmp(event->type, "agenda.parse") != 0) return NW_DONE;
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
