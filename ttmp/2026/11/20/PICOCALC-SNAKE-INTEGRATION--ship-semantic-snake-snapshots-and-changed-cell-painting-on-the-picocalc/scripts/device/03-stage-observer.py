"""Add measurement hooks only to an isolated firmware source tree."""
from pathlib import Path
import sys

tree = Path(sys.argv[1])
if not (tree / "picocalc-os/nucleus/kernel.c").is_file() or tree.resolve() == Path.cwd().resolve():
    raise ValueError("pass the isolated archived source tree")


def patch(relative, before, after):
    file = tree / relative
    source = file.read_text()
    if source.count(before) != 1:
        raise ValueError(f"observer staging anchor changed in {relative}")
    file.write_text(source.replace(before,after))


def memory_keyboard():
    # Keep injected events on the native driver route even when the STM32 is
    # offline. This opt-in test substitutes only the key-count register read.
    path = "picocalc-os/port/esp32p4/main/bus_p4.c"
    patch(path, "static void i2c_worker(void *arg) {", """static volatile bool snake_memory_keys;
void snake_obs_use_memory_keys(void) { snake_memory_keys = true; }

static void i2c_worker(void *arg) {""")
    patch(path, "    if (!err && r.nbytes) err = i2c_master_transmit(dev, r.bytes, r.nbytes, 50);", """
    if (snake_memory_keys && kbd && r.bytes[0] == KBD_REG_KEY && r.nread == 1) {
      int queued = inj_count();
      rd[0] = (uint8_t)(queued > 31 ? 31 : queued);
      r.nbytes = r.nread = 0;
    }
    if (!err && r.nbytes) err = i2c_master_transmit(dev, r.bytes, r.nbytes, 50);""")
    path = "picocalc-os/port/esp32p4/main/main_p4.c"
    patch(path, "    snake_obs_console(rest);", """    if (!strcmp(rest, "memory-keys")) {
      extern void snake_obs_use_memory_keys(void);
      snake_obs_use_memory_keys();
      puts("snake observer: memory keys");
    } else snake_obs_console(rest);""")


if sys.argv[2:] == ["--only-memory-keys"]:
    memory_keyboard()
    raise SystemExit(0)


hook = r'''typedef struct {
  unsigned n;
  vtime_t us;
} snake_obs_time;
static struct {
  bool active;
  unsigned posts, post_bytes;
  snake_obs_time build, stringify, tick, publish, draw, snake_frames, flush;
} snake_obs;

static void snake_obs_add(snake_obs_time *part, vtime_t elapsed) {
  part->n++;
  part->us += elapsed;
}
void snake_obs_callback(const world_t *w, int64_t build, int64_t stringify) {
  if (!snake_obs.active || strcmp(w->name,"snake") || build < 0 || stringify < 0) return;
  snake_obs_add(&snake_obs.build, build);
  snake_obs_add(&snake_obs.stringify, stringify);
}
void snake_obs_console(const char *rest) {
  if (!strcmp(rest,"begin")) {
    memset(&snake_obs, 0, sizeof snake_obs);
    snake_obs.active = true;
  } else if (!strcmp(rest,"end")) {
    snake_obs.active = false;
    printf("{\"posts\":%u,\"postBytes\":%u",snake_obs.posts,snake_obs.post_bytes);
    #define PAIR(key, field) printf(",\"" key "\":{\"n\":%u,\"us\":%lld}", \
        snake_obs.field.n,(long long)snake_obs.field.us)
    PAIR("screenBuild",build);
    PAIR("stringify",stringify);
    PAIR("snakeTickDispatch",tick);
    PAIR("kernelRenderPublish",publish);
    PAIR("compositorDrawDispatch",draw);
    PAIR("compositorSnakeMessage",snake_frames);
    PAIR("displayFlushTurn",flush);
    #undef PAIR
    puts("}");
  }
}
'''

path = "picocalc-os/nucleus/kernel.c"
patch(path, "static void finish_turn(world_t *W) {", hook + """
static void finish_turn(world_t *W) {
  if (snake_obs.active && !strcmp(W->name,"display") && !strcmp(W->turn_type,"flush"))
    snake_obs_add(&snake_obs.flush, port_clock() - W->turn_started);""")
patch(path, "  bool booting = W->boot_ready;", """  bool booting = W->boot_ready;
  bool snake_frame_message = false;""")
patch(path, "      rc = eng_dispatch(W, m);", """      if (snake_obs.active && !strcmp(W->name,"compositor") && !strcmp(W->turn_type,"frames")) {
        world_t *sender = world_by_id(m->from);
        snake_frame_message = sender && !strcmp(sender->name,"snake");
      }
      rc = eng_dispatch(W, m);""")
patch(path, "      kernel_publish(W, \"frames\", post, NULL, 0);", """      if (snake_obs.active && !strcmp(W->name,"snake")) {
        snake_obs.posts++;
        snake_obs.post_bytes += strlen(post);
      }
      kernel_publish(W, "frames", post, NULL, 0);""")
patch(path, "  if (K.realtime) W->prof_render_us += port_clock() - t_render;", """  if (K.realtime) {
    vtime_t render_us = port_clock() - t_render;
    W->prof_render_us += render_us;
    if (snake_obs.active && !booting && !is_settle) {
      vtime_t engine_us = t_render - K.vnow;
      if (!strcmp(W->name,"snake") && !strcmp(W->turn_type,"every 110 ms")) {
        snake_obs_add(&snake_obs.tick, engine_us);
        snake_obs_add(&snake_obs.publish, render_us);
      }
      if (!strcmp(W->name,"compositor") && !strcmp(W->turn_type,"draw")) {
        snake_obs_add(&snake_obs.draw, engine_us);
      }
      if (snake_frame_message) snake_obs_add(&snake_obs.snake_frames, engine_us);
    }
  }""")

path = "picocalc-os/nucleus/native.c"
anchor = "    case NW_SCREEN: {   // nw_screen(tree, hints): what it shows from now on; the kernel posts it after this event"
patch(path,anchor,anchor + """
      extern void snake_obs_callback(const world_t *, int64_t, int64_t);
      snake_obs_callback(W,c->i[0],c->i[1]);""")
path = "picocalc-os/port/esp32p4/main/main_p4.c"
patch(path, '  } else if (!strcmp(cmd, "heap")) heap_report();', '''  } else if (!strcmp(cmd, "heap")) heap_report();
  else if (!strcmp(cmd, "snakeobs")) {
    extern void snake_obs_console(const char *);
    snake_obs_console(rest);
  }''')

path = "cji/src/world-native.js"
patch(path, '''  const tree /*: Any */ = $def.screen($S);
  const hints /*: Any */ = typeof $def.hints === 'function' ? $def.hints($S) : $def.hints;
  $call(${NW.SCREEN}, 0, 0, JSON.stringify(tree), hints || '', undefined);''', '''  const measure = self === 'snake';
  const started = measure ? $call(${NW.NOW}, 0, 0, undefined, undefined, undefined) : 0;
  const tree /*: Any */ = $def.screen($S);
  const hints /*: Any */ = typeof $def.hints === 'function' ? $def.hints($S) : $def.hints;
  const built = measure ? $call(${NW.NOW}, 0, 0, undefined, undefined, undefined) : 0;
  const json = JSON.stringify(tree);
  const done = measure ? $call(${NW.NOW}, 0, 0, undefined, undefined, undefined) : 0;
  $call(${NW.SCREEN}, built - started, done - built, json, hints || '', undefined);''')

if sys.argv[2:] == ["--with-memory-keys"]:
    memory_keyboard()
