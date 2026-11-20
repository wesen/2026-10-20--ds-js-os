// Test-only stimulus and receipts. The normal native loader and filesystem supply the real app and results.
#include <fcntl.h>
#include <unistd.h>
#include "mbedtls/sha256.h"

static struct {
  const char *mode;
  int ask, token, file, root;
  char disk_path[160], previous_screen[65], path[64];
} await_probe;
static int canceled_token;

static bool await_probe_active(const world_t *world) {
  return await_probe.mode && !strcmp(world->name, "editor");
}

static void await_screen(world_t *world, char hex[65]) {
  const char *screen = world->nat->screen ? world->nat->screen : "";
  unsigned char digest[32];
  if (mbedtls_sha256((const unsigned char *)screen, strlen(screen), digest, 0)) {
    strcpy(hex, "error");
    return;
  }
  for (unsigned i = 0; i < sizeof digest; i++) snprintf(hex + 2*i, 3, "%02x", digest[i]);
}

static void await_cleanup(void) {
  world_t *files = world_by_name("files");
  handle_t *child = handle_find(await_probe.file);
  handle_t *root = handle_find(await_probe.root);
  if (files && child) handle_release(child, files);
  if (files && root) handle_release(root, files);
  if (*await_probe.disk_path && unlink(await_probe.disk_path)) puts("AWAITPROBE cleanup-failed");
  memset(&await_probe, 0, sizeof await_probe);
}

void p4_await_check(const char *mode) {
  const char *scenario = !strcmp(mode, "ok") ? "ok" : !strcmp(mode, "bad") ? "bad" :
                         !strcmp(mode, "cancel") ? "cancel" : !strcmp(mode, "reopen") ? "reopen" : NULL;
  world_t *files = world_by_name("files");
  world_t *editor = world_by_name("editor");
  const char *root_path = port_fs_root();
  if (!scenario || !files || !editor || !editor->nat || editor->in_turn ||
      await_probe.mode || !root_path) {
    puts("AWAITPROBE busy-or-missing");
    return;
  }
  snprintf(await_probe.path, sizeof await_probe.path, "pico-await-test-%s.txt", scenario);
  char path[sizeof await_probe.disk_path];
  snprintf(path, sizeof path, "%s/%s", root_path, await_probe.path);
  int fd = open(path, O_CREAT | O_EXCL | O_WRONLY, 0600);
  if (fd < 0) { puts("AWAITPROBE fixture-path-busy"); return; }
  strcpy(await_probe.disk_path, path);
  const char *data = !strcmp(scenario, "bad") ? "\xff" : !strcmp(scenario, "cancel") ?
                     "must never become the document\n" : "Line one\r\nAnother line\r\n";
  bool wrote = write(fd, data, strlen(data)) == (ssize_t)strlen(data);
  if (close(fd) || !wrote) { puts("AWAITPROBE fixture-write-failed"); await_cleanup(); return; }
  char error[128];
  handle_t *root = fs_open_claim(files, "fs:/", error, sizeof error);
  await_probe.root = root ? root->id : 0;
  handle_t *file = root ? fs_at(files, root->id, await_probe.path, "r", error, sizeof error) : NULL;
  if (!file) { puts("AWAITPROBE grant-failed"); await_cleanup(); return; }
  await_probe.mode = scenario;
  await_probe.file = file->id;
  await_screen(editor, await_probe.previous_screen);
  char payload[160];
  snprintf(payload, sizeof payload, "{\"file\":{\"$h\":%d},\"name\":\"%s\"}",
           file->id, await_probe.path);
  const int issuer = ++K.next_promise;
  await_probe.ask = kernel_ask(files, editor, "open", payload, &file->id, 1, issuer, MS(5000));
  if (await_probe.ask <= 0) { puts("AWAITPROBE ask-failed"); await_cleanup(); }
}

static int await_observe(world_t *world, const nw_event_t *event, elf_t *image, int issued_before, int result) {
  if (strcmp(world->name, "editor") || !await_probe.mode) return result;
  if (event->kind == NW_MESSAGE && world->turn_ask == await_probe.ask) {
    await_probe.token = K.next_promise;
    printf("AWAITPROBE start %s token=%d r=%d requests=%d\n", await_probe.mode,
           await_probe.token, result, K.next_promise-issued_before);
    if (result != NW_LATER || K.next_promise-issued_before != 1) {
      puts("AWAITPROBE start-failed");
      await_cleanup();
      return result;
    }
    if (!strcmp(await_probe.mode, "cancel")) {
      canceled_token = await_probe.token;
      const int canceled = image->mod.event(NW_MESSAGE, 1, 0, 0, "cancel", "null", 4, "files");
      char screen[65];
      await_screen(world, screen);
      printf("AWAITPROBE cancel token=%d r=%d unchanged=%d reply=%s\n", await_probe.token, canceled,
             !strcmp(screen, await_probe.previous_screen), world->turn_result ? world->turn_result : "null");
      return canceled;
    }
    if (!strcmp(await_probe.mode, "reopen")) {
      const int stale = image->mod.event(NW_SETTLE, 1, 0, canceled_token, "", "\"old\"", 5, "");
      char screen[65];
      await_screen(world, screen);
      printf("AWAITPROBE stale token=%d current=%d r=%d unchanged=%d\n", canceled_token, await_probe.token,
             stale, !strcmp(screen, await_probe.previous_screen) && !world->turn_done);
    }
  }
  if (event->kind == NW_SETTLE && event->token == await_probe.token) {
    char error[128], screen[65], after_duplicate[65];
    const int held = handle_use(world, await_probe.file, H_FS, R_READ, error, sizeof error) != NULL;
    await_screen(world, screen);
    const char *reply = world->turn_result ? world->turn_result : "null";
    printf("AWAITPROBE settle %s token=%d ok=%d r=%d held=%d unchanged=%d screen=%s reply=%s\n",
           await_probe.mode, event->token, event->ok, result, held,
           !strcmp(screen, await_probe.previous_screen), screen, reply);
    const bool was_done = world->turn_done;
    const int duplicate = image->mod.event(NW_SETTLE, 1, 0, event->token, "", "\"poison\"", 8, "");
    await_screen(world, after_duplicate);
    printf("AWAITPROBE duplicate %s r=%d unchanged=%d\n", await_probe.mode, duplicate,
           !strcmp(screen, after_duplicate) && was_done == world->turn_done);
    await_cleanup();
  }
  return result;
}
