/* Chapter 24: one system call, by the number sdk/nw_wire.h gives it, as the nw_* function that makes it
 * (runtime/nw_world.c; since CJI-4 also the rv32 fake kernel's call, tools/rv32/fw/nw_main.c, which is
 * the kernel's side of the same mapping: there the nw_* functions are the fake kernel's printers). */
static int64_t kernel_call(int op, int a, int b, int64_t c, const char *s0, size_t n0, const char *s1, size_t n1,
	const char *s2, size_t n2, char *out, size_t out_n)
{
	(void)n1; (void)n2;
	switch (op) {
	case 1: nw_log(s0 ? s0 : ""); return 0;
	case 2: return nw_now();
	case 3: return nw_self(out, (int)out_n);
	case 4: return nw_send(s0, s1, s2);
	case 5: return a ? nw_publish_retained(s0, s1) : nw_publish(s0, s1);
	case 6: return nw_reply(s0);
	case 7: return nw_reject(s0 ? s0 : "");
	case 8: return nw_need(s0);
	case 9: return nw_provide(s0);
	case 10: return nw_every(a);
	case 11: return nw_kind(s0);
	case 12: return nw_ask(s0, s1, s2, a);
	case 13: return nw_sleep(a);
	case 14: return nw_i2c_open(s0, a);
	case 15: return nw_i2c(a, (const unsigned char *)s0, (int)n0, b, (int)c);
	case 16: return nw_release(a);
	case 17: return nw_store_load(out, (int)out_n);
	case 18: return nw_store_save(s0);
	case 19: return nw_timer(a, b);
	case 20: return nw_screen(s0, s1 ? s1 : "");
	case 21:
		if (s0 && !strcmp(s0, "title")) return nw_title(s1);
		if (s0 && !strcmp(s0, "icon")) return nw_icon(s1);
		if (s0 && !strcmp(s0, "about")) return nw_about(s1);
		if (s0 && !strcmp(s0, "key")) return nw_key(s1);
		return -1;
	}
	return -1;
}
