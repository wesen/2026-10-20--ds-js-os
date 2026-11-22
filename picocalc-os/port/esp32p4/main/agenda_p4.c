#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "p4.h"

#define SOURCE_LIMIT (64 * 1024)
#define FIRST_FRAME_TARGET_US 2000000
#define READY_REPLY_GRACE_US 50000

#if PICOCALC_RV32_AGENDA
#define AGENDA_ENGINE ENG_NATIVE
#define AGENDA_COMPILE "compileAgendaRv32"
#else
#define AGENDA_ENGINE ENG_WASM
#define AGENDA_COMPILE "compileAgenda"
#endif

static unsigned char *startup_module;
static size_t startup_length;
static vtime_t first_response;
static vtime_t boot_frame_deadline;
static vtime_t boot_reply_received;
#if PICOCALC_AGENDA_EARLY_BOOT
static int boot_notes_token;
#endif

// Buffer the timing data because UART writes would compete with the startup turns.
typedef struct {
  const char *name;
  vtime_t first_us, total_us, js_us[4];
  vtime_t reply_wait_us;
  unsigned attempts;
  unsigned reply_wait_segments;
  int engine;
} world_startup;

static world_startup startup[MAX_WORLDS];
typedef struct {
  vtime_t total_us, reply_wait_us;
  unsigned segments, reply_wait_segments;
} compositor_startup;
static compositor_startup compositor_turns[3];
static const char *const compositor_kinds[] = {"draw", "worlds.status", "other"};
static bool recording_boot;
static bool boot_report_pending;

static char *read_reminder_source(bool edit, size_t *length) {
  if (!edit) return p4_bundle_read("agenda/reminder.typed", length, NULL, 0);
  const char *root = port_fs_root();
  if (!root) return NULL;
  char path[128];
  int n = snprintf(path, sizeof path, "%s/notes/agenda.typed", root);
  if (n < 0 || n >= sizeof path) return NULL;
  FILE *file = fopen(path, "rb");
  if (!file) return NULL;
  char *text = malloc(SOURCE_LIMIT + 1);
  if (text) {
    *length = fread(text, 1, SOURCE_LIMIT + 1, file);
    if (ferror(file) || *length > SOURCE_LIMIT || memchr(text, 0, *length) ||
        !utf8_valid((const unsigned char *)text, *length)) {
      free(text);
      text = NULL;
    }
  }
  fclose(file);
  return text;
}

static char *read_source(bool edit, size_t *length) {
  char *reminder = read_reminder_source(edit, length);
  size_t entry_length = 0;
  char *entry = p4_bundle_read("agenda/entry.typed", &entry_length, NULL, 0);
  char *program = NULL;
  if (reminder && entry && entry_length < SOURCE_LIMIT && *length < SOURCE_LIMIT - entry_length) {
    program = realloc(reminder, *length + entry_length + 2);
    if (program) {
      program[(*length)++] = '\n';
      memcpy(program + *length, entry, entry_length);
      *length += entry_length;
      program[*length] = 0;
    }
  }
  if (!program) free(reminder);
  free(entry);
  return program;
}

static unsigned char *compile(bool edit, size_t *length, vtime_t *started) {
  *started = port_clock();
  size_t source_length = 0, reactor_length = 0;
  char *source = read_source(edit, &source_length);
  char *reactor = p4_bundle_read("agenda/reactor.bin", &reactor_length, NULL, 0);
  if (!source || !reactor) {
    puts("agenda compile: source or reactor unavailable");
    free(source); free(reactor);
    return NULL;
  }
  // Agenda's first frame waits for this compile: the default policy takes 2.75 s on the P4
  // against a 1.7 s deadline, "interactive" 0.98 s (PICOCALC-COMPILE-BUDGET).
  static const p4_compile_limits limits = {.policy = "interactive"};
  unsigned char *module = (unsigned char *)p4_typed_compile("agenda", edit ? "edit" : "bundle",
      source, source_length, "agenda/compile.js", AGENDA_COMPILE, AGENDA_ENGINE,
      reactor, reactor_length, length, *started, &limits);
  free(source);
  free(reactor);
  return module;
}

bool p4_agenda_prepare(void) {
  startup_module = compile(false, &startup_length, &first_response);
  if (startup_module) {
    boot_frame_deadline = first_response + FIRST_FRAME_TARGET_US;
    recording_boot = true;
    printf("agenda boot source_start_us=%lld\n", (long long)first_response);
  }
  return startup_module != NULL;
}

static bool is_typed_agenda(const world_t *world) {
  return !strcmp(world->name, "agenda") && world->engine == AGENDA_ENGINE;
}

void p4_agenda_boot_file_ready(const world_t *world) {
  if (recording_boot && !boot_reply_received && is_typed_agenda(world))
    boot_reply_received = port_clock();
}

bool p4_agenda_boot_frame_pending(void) {
  // Allow a reply already on the kernel's queue to settle before unrelated
  // relocation blocks the lane. Bound the extra delay if rendering fails.
  bool reply_arrived_in_time = boot_reply_received && boot_reply_received < boot_frame_deadline;
  return boot_frame_deadline &&
         port_clock() < boot_frame_deadline + (reply_arrived_in_time ? READY_REPLY_GRACE_US : 0);
}

#if PICOCALC_AGENDA_EARLY_BOOT
bool p4_agenda_boot_dispatch(const world_t *world, int promise) {
  return recording_boot && !world->epoch && promise == boot_notes_token &&
         is_typed_agenda(world) && p4_agenda_boot_frame_pending();
}

void p4_agenda_boot_track_read(const world_t *world, const fs_job_t *job) {
  if (!boot_notes_token && job->op == FS_READ && !strcmp(job->path, "notes/todo.txt") &&
      p4_agenda_boot_dispatch(world, 0))
    boot_notes_token = job->promise;
}
#endif

char *p4_agenda_take_module(size_t *length) {
  char *module = (char *)startup_module;
  startup_module = NULL;
  if (length) *length = startup_length;
  return module;
}

void p4_agenda_console(const char *command) {
  bool edit = !strcmp(command, "build");
  if (!edit && strcmp(command, "baseline")) {
    puts("agenda baseline | agenda build (reads notes/agenda.typed)");
    return;
  }
  world_t *world = world_by_name("agenda");
  if (!world || world->engine != AGENDA_ENGINE) {
    puts("agenda: the typed world is not active");
    return;
  }
  size_t length = 0;
  vtime_t started;
  unsigned char *module = compile(edit, &length, &started);
  if (!module) return;
  // The candidate is fully compiled before touching the running world.
  free(world->source);
  world->source = (char *)module;
  world->source_len = length;
  first_response = started;
  kernel_restart_world(world);
}

void p4_agenda_stage(const world_t *world, const char *stage) {
  if (!first_response) return;
  if (world && !is_typed_agenda(world)) return;
  printf("agenda stage %s us=%lld\n", stage, (long long)(port_clock() - first_response));
}

void p4_agenda_world_segment(const world_t *world, vtime_t start, vtime_t cost, bool booting) {
  if (!recording_boot) return;
  if (!booting && !strcmp(world->name, "compositor")) {
    unsigned kind = 0;
    while (kind < 2 && strcmp(world->turn_type, compositor_kinds[kind])) kind++;
    compositor_startup *turn = &compositor_turns[kind];
    turn->total_us += cost;
    turn->segments++;
    if (boot_reply_received) {
      turn->reply_wait_us += cost;
      turn->reply_wait_segments++;
    }
  }
  world_startup *sample = &startup[world->id];
  if (boot_reply_received) {
    sample->reply_wait_us += cost;
    sample->reply_wait_segments++;
  }
  if (!booting) return;
  if (!sample->attempts++) {
    sample->name = world->name;
    sample->engine = world->engine;
    sample->first_us = start - (boot_frame_deadline - FIRST_FRAME_TARGET_US);
  }
  sample->total_us += cost;
}

void p4_agenda_js_boot(const world_t *world, const vtime_t *stages) {
  if (!recording_boot) return;
  world_startup *sample = &startup[world->id];
  for (int i = 0; i < 4; i++) sample->js_us[i] += stages[i + 1] - stages[i];
}

void p4_agenda_report_boot(void) {
  if (!boot_report_pending) return;
  boot_report_pending = false;
  for (unsigned i = 0; i < sizeof compositor_turns / sizeof *compositor_turns; i++) {
    const compositor_startup *turn = &compositor_turns[i];
    printf("agenda compositor kind=%s total_us=%lld segments=%u reply_wait_us=%lld reply_wait_segments=%u\n",
           compositor_kinds[i], (long long)turn->total_us, turn->segments,
           (long long)turn->reply_wait_us, turn->reply_wait_segments);
  }
  for (int i = 0; i < MAX_WORLDS; i++) {
    const world_startup *sample = &startup[i];
    if (!sample->attempts) continue;
    printf("agenda boot-world name=%s engine=%d first_us=%lld total_us=%lld attempts=%u"
           " js_setup_us=%lld js_prelude_us=%lld js_source_us=%lld js_init_us=%lld"
           " reply_wait_us=%lld reply_wait_segments=%u\n",
           sample->name, sample->engine, (long long)sample->first_us,
           (long long)sample->total_us, sample->attempts,
           (long long)sample->js_us[0], (long long)sample->js_us[1],
           (long long)sample->js_us[2], (long long)sample->js_us[3],
           (long long)sample->reply_wait_us, sample->reply_wait_segments);
  }
}

void p4_agenda_frame(world_t *world, vtime_t segment_start) {
  if (!is_typed_agenda(world)) return;
  vtime_t now = port_clock();
  if (first_response) {
    printf("agenda response us=%lld world_bytes=%zu\n",
           (long long)(now - first_response), world->mem_used);
    first_response = 0;
  }
  boot_frame_deadline = 0;
  boot_reply_received = 0;
  printf("agenda frame turn_us=%lld world_bytes=%zu\n",
         (long long)(now - segment_start), world->mem_used);
  if (recording_boot) {
    recording_boot = false;
    boot_report_pending = true;
  }
}
