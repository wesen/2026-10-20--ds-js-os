/* Use the production kernel while controlling the boundaries around deferred delivery. */
#include "kernel.c"

#include <assert.h>

static world_t *chess, *compositor, *untrusted;
static unsigned source_deliveries, frame_deliveries, ordinary_deliveries;
static const uint8_t frame[] = {0x50, 0x53, 0x49, 0x58, 0, 0x9a};
static const uint8_t source[] = "function fixture(): i32 { return 0; }\n";

void p4_painter_receive(world_t *receiver, world_t *sender, bool is_source, const uint8_t *bytes, size_t length)
{
    assert(receiver == compositor && sender == chess && K.cur == compositor);
    if (is_source) {
        assert(length == sizeof source - 1 && !memcmp(bytes, source, length));
        source_deliveries++;
    } else {
        assert(length == sizeof frame && !memcmp(bytes, frame, length));
        frame_deliveries++;
    }
}

bool p4_painter_draw(dmabuf_t *fb, char *out, size_t capacity)
{
    (void)fb;
    (void)out;
    (void)capacity;
    assert(!"the mailbox test never asks for drawing");
    return false;
}

static int ordinary(world_t *receiver, const nw_event_t *event)
{
    assert(receiver == compositor);
    /* A JSON message with the same type spelling still stays on the ordinary path. */
    assert(!strcmp(event->type, "painter.source") && !strcmp(event->json, "{}"));
    ordinary_deliveries++;
    return NW_DONE;
}

static const native_backend_t backend = {.event = ordinary};

static void start_instance(world_t *world, bool cji)
{
    world->nat = calloc(1, sizeof(*world->nat));
    assert(world->nat);
    world->nat->be = &backend;
    world->nat->cji_handles = cji;
    world->status = W_IDLE;
}

static world_t *world(const char *name, const char *file, bool user, bool cji)
{
    world_t *w = calloc(1, sizeof(*w));
    assert(w);
    snprintf(w->name, sizeof w->name, "%s", name);
    snprintf(w->file, sizeof w->file, "%s", file);
    w->user = user;
    w->id = K.n_worlds;
    w->engine = ENG_NATIVE;
    w->budget_us = MS(100);
    K.worlds[K.n_worlds++] = w;
    start_instance(w, cji);
    return w;
}

static int publish(world_t *from, bool is_source, const uint8_t *bytes, size_t n)
{
    const nw_call_t call = {.op = NW_PAINTER_PUBLISH, .i = {is_source},
                            .s = {(const char *)bytes}, .n = {n}};
    K.cur = from;
    return nat_syscall(from, &call, NULL, 0);
}

static void publish_frame(void)
{
    assert(publish(chess, false, frame, sizeof frame) == 0);
}

static void apply(void)
{
    K.cur = NULL;
    apply_deferred(K.vnow);
}

int main(void)
{
    chess = world("chess", "chess/compiled.bin", false, false);
    compositor = world("compositor", "compositor.elf", false, true);
    untrusted = world("u-other", "chess/compiled.bin", true, false);
    assert(publish(untrusted, true, source, sizeof source - 1) < 0);
    assert(!heap_n && !K.defer_head);
    assert(publish(chess, true, source, sizeof source - 1) == 0);
    uint8_t borrowed[sizeof frame];
    memcpy(borrowed, frame, sizeof frame);
    assert(publish(chess, false, borrowed, sizeof borrowed) == 0);
    memset(borrowed, 0xff, sizeof borrowed);
    assert(!heap_n && !compositor->mbox_len && !source_deliveries && !frame_deliveries);
    apply();
    assert(heap_n == 2 && !compositor->mbox_len);
    kernel_run_until(K.vnow + MS(10));
    assert(source_deliveries == 1 && frame_deliveries == 1);

    for (unsigned i = 0; i < 2; i++) assert(publish(chess, true, source, sizeof source - 1) == 0);
    assert(publish(chess, true, source, sizeof source - 1) < 0);
    for (unsigned i = 0; i < 8; i++) publish_frame();
    assert(publish(chess, false, frame, sizeof frame) < 0);
    discard_deferred();
    assert(!K.defer_head && !painter_pending[0] && !painter_pending[1]);

    publish_frame();
    apply();
    chess->epoch++;
    handle_event(pop());
    assert(!compositor->mbox_len && !painter_pending[0]);

    publish_frame();
    apply();
    compositor->epoch++;
    handle_event(pop());
    assert(!compositor->mbox_len && !painter_pending[0]);

    publish_frame();
    apply();
    handle_event(pop());
    assert(compositor->mbox_len == 1);
    chess->epoch++;
    kernel_run_until(K.vnow + MS(10));
    assert(!compositor->mbox_len && !painter_pending[0] && frame_deliveries == 1);

    publish_frame();
    apply();
    defer_deliver(compositor, new_msg(M_ON, "painter.source", "{}", untrusted->id));
    while (heap_n) handle_event(pop());
    assert(compositor->mbox_len == 2 && compositor->mbox->painter_length);
    teardown(compositor, "test restart");
    assert(compositor->mbox_len == 1 && compositor->mbox == compositor->mbox_tail && !painter_pending[0]);
    start_instance(compositor, true);
    publish_frame();
    apply();
    kernel_run_until(K.vnow + MS(10));
    assert(source_deliveries == 1 && frame_deliveries == 2 && ordinary_deliveries == 1);
    assert(!heap_n && !compositor->mbox_len && !painter_pending[0] && !painter_pending[1]);
    kernel_reset();
    free(heap);
    puts("copied payload, deferred dispatch, quotas, epoch drops, restart purge, and JSON control passed");
}
