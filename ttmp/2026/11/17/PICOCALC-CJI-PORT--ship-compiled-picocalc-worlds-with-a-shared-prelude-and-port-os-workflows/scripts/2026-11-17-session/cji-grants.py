from pathlib import Path
def edit(file,a,b,count=-1):
 p=Path(file); s=p.read_text(); assert a in s,a; p.write_text(s.replace(a,b,count))
n='picocalc-os/nucleus/native.c'
h='picocalc-os/nucleus/nucleus.h'
edit(h,'  bool in_init;', '  bool cji_handles;             // set by the P4 loader for bundled CJI modules\n  bool in_init;')
cm='picocalc-os/port/esp32p4/main/CMakeLists.txt'
edit(cm,'    foreach(name IN LISTS CJI_WORLDS ITEMS toplog)','    set(cji_paths "")\n    foreach(name IN LISTS CJI_WORLDS ITEMS toplog)\n        string(APPEND cji_paths "\\\"natives/${name}.elf\\\",\\n")')
edit(cm,'    foreach(m echo','    file(GENERATE OUTPUT ${CMAKE_CURRENT_BINARY_DIR}/cji_paths.inc CONTENT "${cji_paths}")\n    target_include_directories(${COMPONENT_LIB} PRIVATE ${CMAKE_CURRENT_BINARY_DIR})\n    foreach(m echo')
p4='picocalc-os/port/esp32p4/optional/native_elf/native_elf_p4.c'
edit(p4,'  char *argv[2]', '''  static const char *const bundled_cji[] = {
#include "cji_paths.inc"
  };
  for (size_t i = 0; !W->user && i < sizeof bundled_cji / sizeof bundled_cji[0]; i++)
    if (!strcmp(W->file, bundled_cji[i])) W->nat->cji_handles = true;
  char *argv[2]''')
edit(n,'#include <stdarg.h>', '#include <limits.h>\n#include <stdarg.h>')
edit(n,'typedef struct { const unsigned char *p, *e; int depth; } jp_t;', '''typedef struct { int ids[MAX_MSG_HANDLES], count; } grants_t;
typedef struct { const unsigned char *p, *e; int depth; grants_t *grants; } jp_t;''')
edit(n,'static bool jvalue(jp_t *j)', '''// A marker occupies an entire object. Its decimal ID must fit the kernel's positive int.
static bool jhandle(jp_t *j) {
  jws(j);
  if (!j->grants || j->p == j->e || *j->p < '1' || *j->p > '9') return false;
  int id = 0;
  while (j->p < j->e && *j->p >= '0' && *j->p <= '9') {
    int digit = *j->p++ - '0';
    if (id > (INT_MAX - digit) / 10) return false;
    id = id * 10 + digit;
  }
  jws(j);
  if (j->p == j->e || *j->p++ != '}') return false;
  for (int i = 0; i < j->grants->count; i++) if (j->grants->ids[i] == id) return true;
  if (j->grants->count == MAX_MSG_HANDLES) return false;
  j->grants->ids[j->grants->count++] = id;
  return true;
}
static bool jvalue(jp_t *j)''')
edit(n,'    for (;;) {\n      if (c', '    bool first = true;\n    for (;;) {\n      if (c')
edit(n,'if (!jstr(j, key, sizeof key) || !strcmp(key, "$h"))','if (!jstr(j, key, sizeof key))')
edit(n,"if (j->p >= j->e || *j->p++ != ':') return false;", """if (j->p >= j->e || *j->p++ != ':') return false;
        if (!strcmp(key, "$h")) { j->depth--; return first && jhandle(j); }
        first = false;""")
# embedded NUL in a key cannot match the reserved name
edit(n,'ch < 0x80 ? ch : 0x80','ch && ch < 0x80 ? ch : 0x80')
edit(n,'nat_json_ok(const char *s, size_t n)', 'nat_json_ok(const char *s, size_t n, grants_t *grants)')
edit(n,'(const unsigned char *)s + n, 0 }','(const unsigned char *)s + n, 0, grants }')
edit(n,'nat_json_ok(c->s[i], c->n[i])','nat_json_ok(c->s[i], c->n[i], NULL)')
edit(n,'  switch (c->op) {','''  grants_t grants = {0};
  int payload = c->op == NW_SEND || c->op == NW_ASK ? 2 : c->op == NW_PUBLISH ? 1 : c->op == NW_REPLY ? 0 : -1;
  if (payload >= 0 && c->n[payload]) {
    if (!nat_json_ok(c->s[payload], c->n[payload], W->nat->cji_handles ? &grants : NULL))
      return fail(W, W->nat->cji_handles ? "invalid JSON or capability marker" : BAD_JSON);
    for (int i = 0; i < grants.count; i++) {
      char err[160];
      if (!handle_may_grant(W, grants.ids[i], err, sizeof err)) return fail(W, "%s", err);
    }
  }
  switch (c->op) {''')
for i in (0,1,2): edit(n,f'      if (!payload_ok(c, {i})) return fail(W, BAD_JSON);\n','')
edit(n,'charge(c->n[2]); defer_deliver(T, m);','memcpy(m->hs, grants.ids, grants.count * sizeof(int)); m->nh = grants.count; charge(c->n[2]); defer_deliver(T, m);')
edit(n,'else if ((c->i[0] & 1) && kernel_retain','else if ((c->i[0] & 1) && grants.count) r = fail(W, "a retained post cannot carry handles");\n      else if ((c->i[0] & 1) && kernel_retain')
edit(n,'kernel_publish(W, ch, json, NULL, 0)','kernel_publish(W, ch, json, grants.ids, grants.count)')
edit(n,'kernel_ask(W, T, type, json, NULL, 0','kernel_ask(W, T, type, json, grants.ids, grants.count')
edit(n,'      W->turn_result = c->n[0]','      memcpy(W->reply_hs, grants.ids, grants.count * sizeof(int)); W->reply_nh = grants.count;\n      W->turn_result = c->n[0]')
edit(h,'handle_t *handle_child','bool handle_may_grant(world_t *W, int id, char *err, size_t n);\nhandle_t *handle_child')
edit('picocalc-os/nucleus/hw.c','handle_t *handle_child','''bool handle_may_grant(world_t *W, int id, char *err, size_t n) {
  handle_t *h = handle_use(W, id, -1, 0, err, n);
  if (!h) return false;
  if ((h->rights & R_GRANT) || h->minter == W->id) return true;
  snprintf(err, n, "handle %d cannot be passed on by %s", id, W->name);
  return false;
}

handle_t *handle_child''')
v=Path('picocalc-os/nucleus/vm.c');s=v.read_text(); a=s.index('    handle_t *h = handle_use',s.index('static bool check_grants')); b=s.index('\n  }',a);v.write_text(s[:a]+'    if (!handle_may_grant(W, hs[i], err, sizeof err)) { fail(ctx, "%s", err); return false; }'+s[b:])
