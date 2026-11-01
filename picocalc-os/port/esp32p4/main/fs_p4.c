// Files on the ESP32-P4: a FAT filesystem with wear levelling in the "files" flash partition, mounted at /files.
// nucleus/fs.c does the work with POSIX calls through ESP-IDF's VFS. A job runs on the "fs" worker task; the
// finished job comes back through p4_kq and the kernel task settles the world's promise. The console's ls, cat and
// df read directly, for debugging.
//
// Where the worker runs matters. While ESP-IDF erases or writes flash, it parks the other CPU too (the flash cache
// is off), for the whole operation: tens of milliseconds per 4 KB sector. With the worker on core 0, a save could
// freeze a turn in progress on core 1 and push it past its budget (the compositor overran 80 ms once, PICOCALC-EDIT
// step 5). On the kernel's core at a lower priority, the worker runs only while the kernel task is blocked between
// turns: a flash operation can delay the next turn, but it can no longer stretch one.
#include <dirent.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include "esp_log.h"
#include "esp_timer.h"
#include "esp_vfs_fat.h"
#include "freertos/task.h"
#include "p4.h"

#define ROOT "/files"
static const char *TAG = "fs";
static bool mounted;
static QueueHandle_t q_fs;

const char *port_fs_root(void) { return mounted ? ROOT : NULL; }
int port_fs_info(uint64_t *total, uint64_t *free_bytes) {
  return mounted && esp_vfs_fat_info(ROOT, total, free_bytes) == ESP_OK ? 0 : -1;
}
void port_fs_submit(fs_job_t *j, vtime_t at) {
  (void)at;
  xQueueSend(q_fs, &j, portMAX_DELAY);
}
static void fs_worker(void *arg) {
  for (;;) {
    fs_job_t *j;
    xQueueReceive(q_fs, &j, portMAX_DELAY);
    int64_t t0 = esp_timer_get_time();
    fs_execute(j);
    int64_t ms = (esp_timer_get_time() - t0) / 1000;
    if (ms >= 20) ESP_LOGI(TAG, "op %d on %s took %lld ms", j->op, j->path, ms);
    kmsg_t m = { .fs = j };
    xQueueSend(p4_kq, &m, portMAX_DELAY);
  }
}
void p4_fs_done(fs_job_t *j) {   // the kernel task
  kernel_settle_at(j->w, j->epoch, j->promise, j->ok, j->json, port_clock());
  j->json = NULL;
  fs_job_free(j);
}

void p4_fs_init(void) {
  esp_vfs_fat_mount_config_t cfg = { .format_if_mount_failed = true, .max_files = 4, .allocation_unit_size = CONFIG_WL_SECTOR_SIZE };
  static wl_handle_t wl = WL_INVALID_HANDLE;
  int64_t t0 = esp_timer_get_time();
  esp_err_t e = esp_vfs_fat_spiflash_mount_rw_wl(ROOT, "files", &cfg, &wl);
  if (e != ESP_OK) { ESP_LOGE(TAG, "cannot mount the files partition (%s); no filesystem", esp_err_to_name(e)); return; }
  mounted = true;
  uint64_t total = 0, free_bytes = 0;
  port_fs_info(&total, &free_bytes);
  ESP_LOGI(TAG, "%s: %llu KB, %llu KB free (mounted in %lld ms)", ROOT, total / 1024, free_bytes / 1024, (esp_timer_get_time() - t0) / 1000);
  q_fs = xQueueCreate(16, sizeof(fs_job_t *));
  xTaskCreatePinnedToCore(fs_worker, "fs", 8192, NULL, 4, NULL, 1);   // below the kernel (5), on its core: see above
}

// ---- console: ls [PATH], cat PATH, df -------------------------------------------------------------------------------
void p4_fs_console(const char *cmd, const char *arg) {
  if (!mounted) { printf("no filesystem\n"); return; }
  char f[FS_PATH_MAX + 16];
  if (*arg && !fs_path_ok(arg)) { printf("not a valid path: %s\n", arg); return; }
  snprintf(f, sizeof f, ROOT "%s%s", *arg ? "/" : "", arg);
  if (!strcmp(cmd, "df")) {
    uint64_t total = 0, free_bytes = 0;
    port_fs_info(&total, &free_bytes);
    printf("%s: %llu KB total, %llu KB free\n", ROOT, total / 1024, free_bytes / 1024);
  } else if (!strcmp(cmd, "ls")) {
    DIR *d = opendir(f);
    if (!d) { printf("no directory %s\n", *arg ? arg : "/"); return; }
    struct dirent *de;
    while ((de = readdir(d))) {
      char p[FS_PATH_MAX + 300]; struct stat st;
      snprintf(p, sizeof p, "%s/%s", f, de->d_name);
      if (stat(p, &st)) continue;
      if (S_ISDIR(st.st_mode)) printf("  %s/\n", de->d_name); else printf("  %-40s %8ld\n", de->d_name, (long)st.st_size);
    }
    closedir(d);
  } else {   // cat: the first 4 KB
    FILE *fp = fopen(f, "rb");
    if (!fp) { printf("no file %s\n", arg); return; }
    char b[4097];
    size_t n = fread(b, 1, 4096, fp);
    fclose(fp);
    b[n] = 0;
    printf("%s%s", b, n && b[n - 1] != '\n' ? "\n" : "");
  }
}
