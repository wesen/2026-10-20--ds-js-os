#include "typed_lex_index.h"
#include <stdint.h>
#include <string.h>

enum token_kind { IDENTIFIER = 1, INTEGER, STRING, OPERATOR, FLOAT };
typedef struct { uint32_t start, end, symbol, close; } token_row;
typedef struct {
    uint32_t start, end, kind, byte_at, byte_len, hash;
} symbol_entry;
typedef struct {
    JSContext *ctx;
    const unsigned char *bytes;
    size_t length, pos;
    uint32_t units, open, count, capacity, names, names_cap, slots;
    token_row *rows;
    symbol_entry *symbols;
    uint32_t *table;
} scan_state;

_Static_assert(sizeof(token_row) == 16, "row ABI uses four 32-bit words");

static int ident_start(unsigned char c) {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_';
}
static int digit(unsigned char c) { return c >= '0' && c <= '9'; }
static int hex(unsigned char c) { return digit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'); }
static int ascii_space(unsigned char c) { return c == ' ' || (c >= 9 && c <= 13); }

/* JS_ToCStringLen2(cesu8=true) preserves JS code-unit coordinates for surrogates. */
static void advance_character(scan_state *s) {
    unsigned char c = s->bytes[s->pos];
    if (c < 128) { s->pos++; s->units++; }
    else if (c < 224) { s->pos += 2; s->units++; }
    else if (c < 240) { s->pos += 3; s->units++; }
    else { s->pos += 4; s->units += 2; }
}

static void advance_ascii(scan_state *s, unsigned n) { s->pos += n; s->units += n; }

static int skip_trivia(scan_state *s) {
    const unsigned char *b = s->bytes;
    int comment = 0;
    while (s->pos < s->length) {
        if (ascii_space(b[s->pos])) {
            advance_ascii(s, 1);
        } else if (s->length - s->pos >= 2 && b[s->pos] == '/' && b[s->pos+1] == '/') {
            comment = 1;
            advance_ascii(s, 2);
            while (s->pos < s->length && b[s->pos] != '\n') advance_character(s);
        } else break;
    }
    return comment;
}

/* For unrecognized input the reference JS scanner supplies original diagnostics. */
static enum token_kind scan_token(scan_state *s) {
    const unsigned char *p = s->bytes + s->pos;
    size_t remain = s->length - s->pos;
    if (ident_start(*p) || digit(*p)) {
        enum token_kind kind = digit(*p) ? INTEGER : IDENTIFIER;
        size_t end = 1;
        /* A hex literal is 0x and word characters, as the reference's 0[xX]\w*; the parser checks the digits. */
        int word = kind == IDENTIFIER || (*p == '0' && remain >= 2 && (p[1] == 'x' || p[1] == 'X'));
        while (end < remain && (digit(p[end]) || (word && ident_start(p[end])))) end++;
        if (kind == INTEGER && !word) {
            /* A float literal, as the reference's \d+\.\d+([eE][+-]?\d+)? or \d+[eE][+-]?\d+. */
            if (end + 1 < remain && p[end] == '.' && digit(p[end + 1])) {
                kind = FLOAT;
                end += 2;
                while (end < remain && digit(p[end])) end++;
            }
            if (end + 1 < remain && (p[end] == 'e' || p[end] == 'E')) {
                size_t at = end + 1;
                if (p[at] == '+' || p[at] == '-') at++;
                if (at < remain && digit(p[at])) {
                    kind = FLOAT;
                    end = at + 1;
                    while (end < remain && digit(p[end])) end++;
                }
            }
        }
        advance_ascii(s, (unsigned)end);
        return kind;
    }
    if (*p == '"') {
        advance_ascii(s, 1);
        while (s->pos < s->length) {
            unsigned char c = s->bytes[s->pos];
            if (c < 32) return 0;
            if (c == '"') { advance_ascii(s, 1); return STRING; }
            if (c != '\\') { advance_character(s); continue; }
            advance_ascii(s, 1);
            if (s->pos == s->length) return 0;
            c = s->bytes[s->pos];
            if (c == 'u') {
                if (s->length - s->pos < 5) return 0;
                for (unsigned i = 1; i < 5; i++) if (!hex(s->bytes[s->pos+i])) return 0;
                advance_ascii(s, 5);
            } else {
                if (!c || !strchr("\"\\/bfnrt", c)) return 0;
                advance_ascii(s, 1);
            }
        }
        return 0;
    }
    unsigned width = 0;
    if (remain >= 3 && (((*p == '=' || *p == '!') && p[1] == '=' && p[2] == '=') ||
                        (*p == '>' && p[1] == '>' && p[2] == '>'))) width = 3;
    else if (remain >= 2 && (((*p == '<' || *p == '>') && p[1] == '=') ||
             ((*p == '<' || *p == '>' || *p == '&' || *p == '|') && p[1] == *p))) width = 2;
    else if (*p && *p < 128 && strchr("{}():;,.=-+*/%!<>&|^~?[]", *p)) width = 1;
    if (!width) return 0;
    advance_ascii(s, width);
    return OPERATOR;
}

static uint32_t symbol_hash(const unsigned char *p, size_t length, uint32_t kind) {
    uint32_t h = 2166136261u ^ kind;
    for (size_t i = 0; i < length; i++) h = (h ^ p[i]) * 16777619u;
    return h;
}

/* Slots contain ordinal plus one. Rehashing never changes an emitted ordinal. */
static int grow_table(scan_state *s) {
    uint32_t size = s->slots ? s->slots * 2 : 256;
    uint32_t *table = js_mallocz(s->ctx, size * sizeof(*table));
    if (!table) return -1;
    for (uint32_t i = 0; i < s->names; i++) {
        uint32_t slot = s->symbols[i].hash & (size - 1);
        while (table[slot]) slot = (slot + 1) & (size - 1);
        table[slot] = i + 1;
    }
    js_free(s->ctx, s->table);
    s->table = table;
    s->slots = size;
    return 0;
}

static int intern(scan_state *s, uint32_t start, size_t byte_at, uint32_t kind, uint32_t *ordinal) {
    size_t length = s->pos - byte_at;
    if (s->names * 3 >= s->slots * 2 && grow_table(s) < 0) return -1;
    uint32_t h = symbol_hash(s->bytes + byte_at, length, kind);
    uint32_t slot = h & (s->slots - 1);
    while (s->table[slot]) {
        uint32_t i = s->table[slot]-1;
        const symbol_entry *sym = &s->symbols[i];
        if (sym->hash == h && sym->kind == kind && sym->byte_len == length &&
            !memcmp(s->bytes + sym->byte_at, s->bytes + byte_at, length)) {
            *ordinal = i;
            return 0;
        }
        slot = (slot + 1) & (s->slots - 1);
    }
    if (s->names == s->names_cap) {
        uint32_t size = s->names_cap ? s->names_cap * 2 : 128;
        symbol_entry *next = js_realloc(s->ctx, s->symbols, size * sizeof(*next));
        if (!next) return -1;
        s->symbols = next;
        s->names_cap = size;
    }
    s->symbols[s->names] = (symbol_entry){start, s->units, kind, (uint32_t)byte_at, (uint32_t)length, h};
    *ordinal = s->names++;
    s->table[slot] = *ordinal + 1;
    return 0;
}

static int add_row(scan_state *s, uint32_t start, size_t byte_at, enum token_kind kind) {
    if (s->count == s->capacity) {
        uint32_t size = s->capacity ? s->capacity + s->capacity / 2 + 8 : (uint32_t)(s->length / 5 + 8);
        token_row *next = js_realloc(s->ctx, s->rows, size * sizeof(*next));
        if (!next) return -1;
        s->rows = next;
        s->capacity = size;
    }
    uint32_t ordinal;
    if (intern(s, start, byte_at, kind, &ordinal) < 0) return -1;
    token_row *row = &s->rows[s->count++];
    *row = (token_row){start, s->units, ordinal, 0};
    if (kind == OPERATOR && s->bytes[byte_at] == '{') {
        row->close = s->open;
        s->open = s->count;
    } else if (kind == OPERATOR && s->bytes[byte_at] == '}') {
        if (!s->open) return 1;
        token_row *opening = &s->rows[s->open-1];
        s->open = opening->close;
        opening->close = s->count;
    }
    return 0;
}

static void free_words(JSRuntime *rt, void *opaque, void *ptr) {
    (void)opaque;
    js_free_rt(rt, ptr);
}

/* JS_NewArrayBuffer transfers its supplied block only on success. */
static JSValue take_buffer(JSContext *ctx, void *ptr, size_t size) {
    JSValue val = JS_NewArrayBuffer(ctx, ptr, size, free_words, NULL, 0);
    if (JS_IsException(val)) js_free(ctx, ptr);
    return val;
}

static JSValue make_index(JSContext *ctx, JSValueConst self, int argc, JSValueConst *argv) {
    (void)self;
    if (argc != 1 || !JS_IsString(argv[0])) return JS_NULL;
    scan_state s = {.ctx = ctx};
    JSValue result = JS_NULL;
    s.bytes = (const unsigned char *)JS_ToCStringLen2(ctx, &s.length, argv[0], 1);
    if (!s.bytes) { result = JS_EXCEPTION; goto done; }
    if (s.length > 1024 * 1024) goto done;
    for (;;) {
        int comment = skip_trivia(&s);
        if (s.pos == s.length) {
            /* The reference sticky expression can backtrack into trailing comments. */
            if (comment) goto done;
            break;
        }
        size_t byte_at = s.pos;
        uint32_t at = s.units;
        enum token_kind kind = scan_token(&s);
        if (!kind) goto done;
        int added = add_row(&s, at, byte_at, kind);
        if (added > 0) goto done;
        if (added < 0) { result = JS_EXCEPTION; goto done; }
    }
    if (s.open) goto done;
    uint32_t *dict = js_malloc(ctx, (s.names ? s.names * 3 : 1) * sizeof(*dict));
    if (!dict) { result = JS_EXCEPTION; goto done; }
    for (uint32_t i = 0; i < s.names; i++) {
        dict[3*i] = s.symbols[i].start;
        dict[3*i+1] = s.symbols[i].end;
        dict[3*i+2] = s.symbols[i].kind;
    }
    result = JS_NewArray(ctx);
    if (JS_IsException(result)) { js_free(ctx, dict); goto done; }
    JSValue rows = take_buffer(ctx, s.rows, s.count * sizeof(*s.rows));
    s.rows = NULL;
    if (JS_IsException(rows) || JS_SetPropertyUint32(ctx, result, 0, rows) < 0) {
        js_free(ctx, dict);
        JS_FreeValue(ctx, result);
        result = JS_EXCEPTION;
        goto done;
    }
    JSValue names = take_buffer(ctx, dict, s.names * 3 * sizeof(*dict));
    if (JS_IsException(names) || JS_SetPropertyUint32(ctx, result, 1, names) < 0) {
        JS_FreeValue(ctx, result);
        result = JS_EXCEPTION;
    }
done:
    js_free(ctx, s.rows);
    js_free(ctx, s.table);
    js_free(ctx, s.symbols);
    if (s.bytes) JS_FreeCString(ctx, (const char *)s.bytes);
    if (JS_IsException(result)) {
        /* This accelerator allocates only private records. After reclaiming
           them the cursor can read the original input under the same limit. */
        JS_FreeValue(ctx, JS_GetException(ctx));
        return JS_NULL;
    }
    return result;
}

int typed_lex_index_install(JSContext *ctx) {
    JSValue global = JS_GetGlobalObject(ctx);
    JSValue fn = JS_NewCFunction(ctx, make_index, "__typedLexIndex", 1);
    int ok = !JS_IsException(fn) && JS_SetPropertyStr(ctx, global, "__typedLexIndex", fn) >= 0;
    JS_FreeValue(ctx, global);
    return ok;
}
