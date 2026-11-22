#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "nw.h"
#include "nw_ui.h"
#include "nw_utf16.h"
#include "slots.h"

enum { NAME_BYTES = 96, PATH_BYTES = 192, ITEM_LIMIT = 256, VIEW_ROWS = 25 };
enum { IDLE, LIST, INFO, MKDIR, RENAME, REMOVE, EDITOR };
enum { NO_PROMPT, NEW_FILE, NEW_DIR, RENAME_ENTRY };
typedef struct { char name[NAME_BYTES]; double size; bool dir; } entry;

static entry items[ITEM_LIMIT];
static char path[PATH_BYTES], keep[NAME_BYTES], confirm[NAME_BYTES], removed[NAME_BYTES];
static char input[NAME_BYTES], rename_from[NAME_BYTES], note[2 * PATH_BYTES];
static char screen[16384];
static int root, token, pending, given, offered, count, selected, prompt;
static double free_bytes = -1;
static bool more, refresh_after_open;

static bool truth(const char *json, const char *key)
{
    const char *p = nw_json_find(json, key);
    return p && !strncmp(p, "true", 4);
}

static void text_size(char *out, int size, double bytes)
{
    static const char *const units[] = {"KB", "MB", "GB"};
    if (bytes < 1024) { snprintf(out, size, "%u B", (unsigned)bytes); return; }
    int unit = 0;
    bytes /= 1024;
    while (unit < 2 && bytes >= 1024) { bytes /= 1024; unit++; }
    // The original Files uses toFixed(1), which rounds positive ties up.
    uint64_t tenths = (uint64_t)(bytes * 10 + 0.5);
    snprintf(out, size, "%llu.%u %s", (unsigned long long)(tenths / 10),
             (unsigned)(tenths % 10), units[unit]);
}

static void paint(void)
{
    char heading[PATH_BYTES + 1], capacity[48] = "";
    snprintf(heading, sizeof heading, "/%s", path);
    if (free_bytes >= 0) {
        text_size(capacity, sizeof capacity - 5, free_bytes);
        strcat(capacity, " free");
    }
    nw_ui ui;
    nw_ui_begin(&ui, screen, sizeof screen);
    nw_ui_open(&ui, "col", "\"gap\":4");
    nw_ui_open(&ui, "row", "\"gap\":6");
    nw_ui_text(&ui, heading, "\"font\":\"s\",\"color\":\"ink\",\"grow\":1");
    nw_ui_text(&ui, capacity, "\"font\":\"s\",\"color\":\"muted\",\"align\":\"right\"");
    nw_ui_close(&ui);
    if (count) {
        int first = selected - VIEW_ROWS / 2, last = count - VIEW_ROWS;
        if (first > last) first = last;
        if (first < 0) first = 0;
        char list[160];
        snprintf(list, sizeof list, "{\"t\":\"list\",\"font\":\"s\",\"lead\":6,\"grow\":1,\"sel\":%d,"
                 "\"windowStart\":%d,\"totalItems\":%d,\"items\":[", selected - first, first, count);
        nw_ui_node(&ui, list);
        for (int i = first; i < count && i < first + VIEW_ROWS; i++) {
            if (i != first) nw_ui__raw(&ui, ",");
            char label[NAME_BYTES + 1], bytes[48] = "";
            snprintf(label, sizeof label, "%s%s", items[i].name, items[i].dir ? "/" : "");
            if (!items[i].dir) text_size(bytes, sizeof bytes, items[i].size);
            nw_ui__raw(&ui, "{\"label\":");
            nw_ui_str(&ui, label);
            nw_ui__raw(&ui, ",\"right\":");
            nw_ui_str(&ui, bytes);
            nw_ui__raw(&ui, items[i].dir ? ",\"color\":\"blue\"}" : ",\"color\":\"\"}");
        }
        nw_ui__raw(&ui, "]}");
    } else nw_ui_text(&ui, path[0] ? "Empty folder. Backspace goes up." : "No files yet. F2 makes one.",
                      "\"font\":\"s\",\"color\":\"muted\",\"grow\":1");
    if (prompt) {
        static const char *const labels[] = {"", "New file: ", "New folder: ", "Rename to: "};
        nw_ui_node(&ui, "{\"t\":\"input\",\"font\":\"s\",\"prompt\":");
        nw_ui_str(&ui, labels[prompt]);
        nw_ui__raw(&ui, ",\"value\":");
        nw_ui_str(&ui, input);
        nw_ui__raw(&ui, "}");
    } else nw_ui_node(&ui, "{\"t\":\"gap\",\"h\":0}");
    nw_ui_text(&ui, note[0] ? note : more ? "Only the first 256 entries are shown." : "",
               "\"font\":\"s\",\"color\":\"accent\",\"wrap\":true");
    nw_ui_close(&ui);
    if (nw_ui_end(&ui) >= 0) nw_screen(screen, prompt ? "Enter ok  Esc cancel" : "⏎ open F2 new F3 dir F4 rename F5 del");
}

static bool decode(const char *text, files_string *string)
{
    int length = nw_utf16_decode(text, string->units, sizeof string->units / sizeof *string->units);
    if (length < 0) return false;
    string->length = length;
    return true;
}

static int compare(const void *a, const void *b)
{
    const entry *left = a, *right = b;
    files_string l, r;
    if (!decode(left->name, &l) || !decode(right->name, &r)) return strcmp(left->name, right->name);
    return filesCompare(&l, left->dir, &r, right->dir);
}

static bool load_entries(const char *json)
{
    more = false;
    count = 0;
    const char *p = nw_json__ws(json);
    if (*p != '[') return false;
    p = nw_json__ws(p + 1);
    while (*p == '{') {
        if (truth(p, "more")) more = true;
        else if (count < ITEM_LIMIT) {
            entry *item = &items[count];
            if (nw_json_str(p, "name", item->name, sizeof item->name) < 0) return false;
            item->dir = truth(p, "dir");
            if (!nw_json_num(p, "size", &item->size)) return false;
            count++;
        }
        p = nw_json__skip(p, 0);
        if (!p) return false;
        p = nw_json__ws(p);
        if (*p != ',') break;
        p = nw_json__ws(p + 1);
    }
    if (*p != ']') return false;
    qsort(items, count, sizeof *items, compare);
    selected = filesSelect(selected, count, 0);
    if (keep[0]) for (int i = 0; i < count; i++) if (!strcmp(items[i].name, keep)) { selected = i; break; }
    return true;
}

static void issue(int operation, const char *verb, const char *relative, const char *argument)
{
    int next = nw_fs_op(root, verb, relative, argument);
    if (next < 0) {
        if (operation == INFO) free_bytes = -1;
        else nw_error(note, sizeof note);
        if (operation == LIST) count = 0;
    } else {
        pending = operation;
        token = next;
    }
}

static void list(const char *name)
{
    snprintf(keep, sizeof keep, "%s", name);
    issue(LIST, "list", path, NULL);
    if (!token) issue(INFO, "info", "", NULL);
}

static void join(char *out, const char *name)
{
    snprintf(out, PATH_BYTES, "%s%s%s", path, path[0] ? "/" : "", name);
}

static void retire(int handle)
{
    if (handle > 0) { nw_revoke(handle); nw_release(handle); }
}

static void open_file(const char *full, bool reselect)
{
    offered = nw_fs_at(root, full, "rw");
    int next = offered > 0 ? nw_ask_file("editor", "open", offered, full, 3000) : -1;
    if (next > 0) {
        refresh_after_open = reselect;
        token = next;
        pending = EDITOR;
    } else {
        char error[160];
        nw_error(error, sizeof error);
        snprintf(note, sizeof note, "Editor: %s", error);
        retire(offered);
        offered = 0;
    }
}

static void accept_prompt(void)
{
    files_string value, normalized = {.length = 64};
    int operation = prompt;
    prompt = NO_PROMPT;
    int length = decode(input, &value) ? filesName(&value, &normalized) : -1;
    if (length < 1 || length > 64) {
        snprintf(note, sizeof note, "Names: letters, digits, space . _ - (64 at most), not ending in a space or dot.");
        return;
    }
    char name[65], full[PATH_BYTES];
    for (int i = 0; i < length; i++) name[i] = (char)normalized.units[i];
    name[length] = 0;
    join(full, name);
    snprintf(keep, sizeof keep, "%s", name);
    if (operation == NEW_FILE) {
        open_file(full, true);
        if (!token) list(name);
    } else if (operation == NEW_DIR) issue(MKDIR, "mkdir", full, NULL);
    else {
        char old[PATH_BYTES];
        join(old, rename_from);
        issue(RENAME, "rename", old, full);
    }
}

static void press(const char *json)
{
    static const char *const names[] = {"", "up", "down", "pgup", "pgdn", "enter", "right",
        "backspace", "left", "f2", "f3", "f4", "f5", "esc"};
    static const int delta[] = {0, -1, 1, -10, 10};
    char key[24], state[12];
    if (nw_json_str(json, "key", key, sizeof key) < 0 ||
        nw_json_str(json, "state", state, sizeof state) < 0 || !strcmp(state, "up")) return;
    int k = 0;
    for (int i = 1; i < sizeof names / sizeof *names; i++) if (!strcmp(key, names[i])) { k = i; break; }
    bool once = strcmp(state, "hold") != 0;
    const entry *item = selected < count ? &items[selected] : NULL;
    bool confirmed = item && !strcmp(item->name, confirm);
    if (!prompt && (k != 12 || !once)) { confirm[0] = 0; note[0] = 0; }
    int action = filesAction(k, once, prompt != 0, item ? (item->dir ? 2 : 1) : 0, confirmed);
    if (action > 0 && action <= 4) { selected = filesSelect(selected, count, delta[action]); return; }

    char full[PATH_BYTES];
    switch (action) {
    case 5: join(full, item->name); open_file(full, false); break;
    case 6: join(full, item->name); strcpy(path, full); selected = 0; list(""); break;
    case 7: {
        size_t n = strlen(input);
        if (n) { while (((unsigned char)input[--n] & 0xc0) == 0x80) {} input[n] = 0; }
        break;
    }
    case 8:
        if (path[0]) {
            char *leaf = strrchr(path, '/');
            strcpy(full, leaf ? leaf + 1 : path);
            if (leaf) *leaf = 0;
            else path[0] = 0;
            list(full);
        }
        break;
    case 9: case 10: prompt = action == 9 ? NEW_FILE : NEW_DIR; input[0] = 0; break;
    case 11: prompt = RENAME_ENTRY; strcpy(input, item->name); strcpy(rename_from, item->name); break;
    case 12:
        strcpy(confirm, item->name);
        snprintf(note, sizeof note, "F5 again deletes %s%s", item->name, item->dir ? " (it must be empty)" : "");
        break;
    case 13: prompt = NO_PROMPT; break;
    case 14: confirm[0] = 0; strcpy(removed, item->name); join(full, item->name); issue(REMOVE, "remove", full, NULL); break;
    case 15: accept_prompt(); break;
    case 16: {
        char ch[4];
        files_string value;
        if (decode(input, &value) && value.length < 64 && nw_json_str(json, "ch", ch, sizeof ch) == 1 &&
            ch[0] >= 32 && ch[0] <= 126) strcat(input, ch);
        break;
    }
    }
}

static void settle(const nw_event *event)
{
    int operation = pending;
    pending = IDLE;
    token = 0;
    if (operation == EDITOR) {
        if (event->ok && truth(event->json, "ok")) {
            retire(given);
            given = offered;
            nw_send("compositor", "open", "{\"app\":\"editor\"}");
        } else {
            char why[160] = "";
            if (event->ok) nw_json_str(event->json, "why", why, sizeof why);
            else nw_json_string(event->json, why, sizeof why);
            snprintf(note, sizeof note, "Editor: %s", why[0] ? why : "no answer");
            retire(offered);
        }
        offered = 0;
        if (refresh_after_open) {
            issue(LIST, "list", path, NULL);
            if (!token) issue(INFO, "info", "", NULL);
        }
    } else if (operation == LIST) {
        if (!event->ok || !load_entries(event->json)) {
            count = 0;
            selected = 0;
            if (event->ok || nw_json_string(event->json, note, sizeof note) < 0)
                snprintf(note, sizeof note, "Invalid directory listing");
        }
        issue(INFO, "info", "", NULL);
    } else if (operation == INFO) {
        free_bytes = -1;
        if (event->ok) nw_json_num(event->json, "free", &free_bytes);
    } else if (!event->ok) nw_json_string(event->json, note, sizeof note);
    else {
        if (operation == REMOVE) {
            snprintf(note, sizeof note, "Deleted %s", removed);
            list("");
        } else {
            issue(LIST, "list", path, NULL);
            if (!token) issue(INFO, "info", "", NULL);
        }
    }
}

void nw_init(void)
{
    nw_kind("app");
    nw_title("Files");
    nw_key("d");
    nw_about("Browse the files on the device. Opening one hands the editor that file and nothing else.");
    nw_icon("[[\"fill\",2,3,14,4],[\"rect\",2,6,36,22],[\"fill\",2,6,36,3]]");
    root = nw_fs_open("fs:/");
    if (root < 0) nw_error(note, sizeof note);
}

int nw_on_event(const nw_event *event)
{
    if (event->kind == NW_SETTLE && token && event->token == token) settle(event);
    if (event->kind == NW_START && root >= 0) list("");
    if (event->kind == NW_MESSAGE && !strcmp(event->from, "compositor") && root >= 0) {
        if (!strcmp(event->type, "key")) press(event->json);
        if (!strcmp(event->type, "focus")) list(selected < count ? items[selected].name : "");
    }
    if (token) return NW_LATER;
    paint();
    return NW_DONE;
}
