#!/bin/sh
# CJI-4 (chapter 30): tools/nw-fake-test.sh for the board. Each world named in tests/native/*.events is
# built as the module the board loads (slas-rv32 -c NAME.so --module: an ELF shared object, no C compiler),
# loaded by the rv32 emulator as elf_loader would load it (bench/emu/emu.c, load_shared) into a test
# firmware (the runtime, the glue runtime/cji_elf.c, and a fake kernel that speaks picocalc-os's
# sdk/nw_elf.h and prints as tools/nw_fake.c does), and sent the events; the calls it makes must be
# tests/native/NAME.out, which the host build makes. Last, a module built from C the board's way
# (tools/rv32/fw/ref_module.c with sdk/nw_elf.c, by clang and ld.lld) goes through the same loader.
#
#   sh tools/rv32/nw-test.sh            with a snapshot (chapter 27): the host's slas runs main and writes the
#                                       heap it built (slas --snapshot-out), slas-rv32 lays it out (--snapshot)
#   NOSNAP=1 sh tools/rv32/nw-test.sh   no snapshot: the world's main runs when it starts
#   UNITS=1 ...                         each world compiled alone against the world runtime's unit (chapter 32),
#                                       which is in the firmware (build/rv32/fw-nw-units.elf), assembled once by
#                                       slas-rv32 --lib; the module has only the world's own code (--extern)
#   ROOTSTACK=N ...                     each world's root stack N bytes (slas-rv32 --rootstack; 4 KB otherwise).
#                                       With UNITS=1 and the default, tools/rv32/fw/deep.world.js also recurses
#                                       100 deep (it fits) and 1,000 deep: the frame push's check must crash it
#                                       cleanly, "root stack overflow" in its log (tools/rv32/fw/deep.out)
#   BOARD=1 ...                         (part 2) each world compiled on the board: build/rv32/fw-board.elf takes the
#                                       world's source, compiles it with stage 1 (--world-unit), assembles the module
#                                       with slas built for rv32 into memory, loads it from there and runs the events.
#                                       Three checks: its SLIR is stage 0's on the host, its module is the one host
#                                       slas-rv32 writes (UNITS=1 NOSNAP=1), its calls are NAME.out
#   MULTI=1 ...                         (with UNITS=1) the four worlds loaded into one firmware, their events
#                                       taken in turn (tools/nw_multi.c's order); each world's lines must still
#                                       be its NAME.out. A fifth world, tools/rv32/fw/hog.world.js, holds more memory
#                                       at each ask: with the kernel's mem_kb at NW_MEM_KB (320 by default) it must
#                                       crash alone, "out of memory" in its log, the others unchanged. Then the
#                                       control: the four with a glue that does not swap the runtime's state
#                                       (fw-nw-units-noswap.elf) must go wrong.
#
# Each world's figures: its module's bytes, what the loader gave it (elf_loader's segment size), its snapshot,
# and the most its allocations through the kernel's allocator held at once (blocks), which with the loaded bytes
# is what the board charges to its mem_kb.
#
# Logs and modules are in build/rv32/nw. NW_STEPS=1 writes each call's instruction count to NAME.steps.
set -e
here=$(cd "$(dirname "$0")/../.." && pwd)
pc=${PICOCALC:-$here/../picocalc-os}
cd "$here"
if [ -n "$BOARD" ]; then   # (part 2: each world compiled on the board, by the firmware; three checks)
	make -s slas rv32-board PICOCALC="$pc" > /dev/null
	out=build/rv32/nw
	mkdir -p $out
	fail=0
	for ev in tests/native/*.events; do
		name=$(basename "$ev" .events)
		file=$(head -1 "$ev")
		case "$file" in tests/*) src=$file ;; *) src=$pc/js/$file ;; esac
		node cji.js "$src" --world-unit --emit > $out/$name.own.slir
		node tools/link-units.mjs build/rv32/unit/prelude-unit.slir $out/$name.own.slir > $out/$name.slir
		./slas-rv32 -c $out/$name.so --module --extern build/rv32/unit/unit.list $out/$name.slir 2> $out/$name.slas.log
		events=$(tail -n +2 "$ev" | tr '\n' ' ')
		rm -f $out/$name.board.slir $out/$name.board.so
		set +e
		RV32_SIZES=1 RV32_CLOCK=1 sh -c "build/rv32/rv32emu build/rv32/fw-board.elf -- -o $out/$name.board $src -- NW_SELF=$name NW_MEM=1 $events" \
			> $out/$name.board.raw 2>&1
		set -e
		grep -v -e '^rv32emu: ' -e '^fw: ' -e '^slas-rv32: ' $out/$name.board.raw > $out/$name.board.got || true
		if ! cmp -s $out/$name.board.slir $out/$name.own.slir; then echo "$name: FAILED, the SLIR stage 1 wrote on the board is not the host's"; tail -3 $out/$name.board.raw; fail=1
		elif ! cmp -s $out/$name.board.so $out/$name.so; then echo "$name: FAILED, the module slas wrote on the board is not slas-rv32's on the host"; fail=1
		elif ! cmp -s $out/$name.board.got tests/native/$name.out; then echo "$name: FAILED, its calls"; diff $out/$name.board.got tests/native/$name.out | head -10; fail=1
		else echo "$name: compiled on the board: SLIR = the host's ($(wc -c < $out/$name.own.slir) bytes), module = slas-rv32's ($(wc -c < $out/$name.so) bytes), calls = $name.out;" \
			"$(sed -n 's/^fw: phase \([a-z]*\) steps \([0-9]*\) .*/\1 \2/p' $out/$name.board.raw | tr '\n' ' ' | sed 's/ $//') instructions"
		fi
	done
	exit $fail
fi
if [ -n "$UNITS" ]; then
	make -s slas rv32-nw-units PICOCALC="$pc" > /dev/null
	fw=build/rv32/fw-nw-units.elf
	ext="--extern build/rv32/unit/unit.list"
else
	make -s slas rv32-nw PICOCALC="$pc" > /dev/null
	fw=build/rv32/fw-nw.elf
	ext=
fi
out=build/rv32/nw
mkdir -p $out
rs=${ROOTSTACK:+--rootstack $ROOTSTACK}
fail=0
mods= args=
for ev in tests/native/*.events; do
	name=$(basename "$ev" .events)
	rm -f $out/$name.snap
	file=$(head -1 "$ev")
	case "$file" in tests/*) src=$file ;; *) src=$pc/js/$file ;; esac
	if [ -n "$UNITS" ]; then   # (chapter 32: the world alone, joined with the runtime unit's text)
		node cji.js "$src" --world-unit --emit > $out/$name.own.slir
		node tools/link-units.mjs build/rv32/unit/prelude-unit.slir $out/$name.own.slir > $out/$name.slir
	else
		node cji.js "$src" --native --emit > $out/$name.slir
	fi
	if [ -n "$NOSNAP" ]; then
		./slas-rv32 -c $out/$name.so --module $ext $rs $out/$name.slir 2> $out/$name.slas.log
	else   # (a world whose main makes a system call gets none, and says why: toplog)
		./slas --snapshot-out $out/$name.snap $ext $out/$name.slir 2> $out/$name.slas.log
		./slas-rv32 -c $out/$name.so --module $ext $rs --snapshot $out/$name.snap $out/$name.slir 2>> $out/$name.slas.log
	fi
	events=$(tail -n +2 "$ev" | tr '\n' ' ')
	mods="$mods $out/$name.so"; args="$args world $name $events"
	[ -n "$MULTI" ] && continue
	# the events: every line after the first, each word one argument (the shell removes the quotes)
	set +e
	RV32_SIZES=1 sh -c "build/rv32/rv32emu $fw $out/$name.so -- NW_SELF=$name NW_MEM=1 ${NW_STEPS:+NW_STEPS=1} $events" > $out/$name.raw 2>&1
	set -e
	grep -v -e '^rv32emu: ' -e '^fw: ' $out/$name.raw > $out/$name.got || true   # (the machine's and firmware's lines)
	grep '^fw: steps' $out/$name.raw > $out/$name.steps || true
	size=$(sed -n 's/^rv32emu: .*: \([0-9]*\) bytes loaded$/\1/p' $out/$name.raw)
	snap=$(sed -n 's/^words \([0-9]*\) .*/, a snapshot of \1 words/p' $out/$name.snap 2>/dev/null || true)
	blocks=$(sed -n 's/^fw: memory .* blocks-peak \([0-9]*\) .*/\1/p' $out/$name.raw)
	rsused=$(sed -n 's/^fw: memory .* rootstack-used \([0-9]*\)$/\1/p' $out/$name.raw)
	if cmp -s $out/$name.got tests/native/$name.out; then echo "$name: ok (module $(wc -c < $out/$name.so) bytes, $size loaded$snap; blocks at most $blocks, of its root stack $rsused bytes used)"
	else echo "$name: FAILED"; diff $out/$name.got tests/native/$name.out | head -10; fail=1; fi
done
if [ -n "$MULTI" ]; then   # chapter 28 on the board: every module in one firmware, one runtime, one unit
	node cji.js tools/rv32/fw/hog.world.js --world-unit --emit > $out/hog.own.slir
	node tools/link-units.mjs build/rv32/unit/prelude-unit.slir $out/hog.own.slir > $out/hog.slir
	./slas --snapshot-out $out/hog.snap $ext $out/hog.slir 2> $out/hog.slas.log
	./slas-rv32 -c $out/hog.so --module $ext --snapshot $out/hog.snap $out/hog.slir 2>> $out/hog.slas.log
	for control in "" -noswap; do
		set +e
		if [ -z "$control" ]; then   # (the four, and the hog under the kernel's limit)
			sh -c "build/rv32/rv32emu $fw $mods $out/hog.so -- NW_MEM=1 NW_MEM_KB=${NW_MEM_KB:-320} ${NW_STEPS:+NW_STEPS=1} $args \
				world hog start ask grow null ask grow null ask grow null ask grow null ask grow null ask grow null ask grow null ask grow null" > $out/multi.raw 2>&1
		else
			sh -c "build/rv32/rv32emu ${fw%.elf}$control.elf $mods -- $args" > $out/multi$control.raw 2>&1
		fi
		set -e
		wrong=0
		for ev in tests/native/*.events; do
			name=$(basename "$ev" .events)
			sed -n "s/^$name: //p" $out/multi$control.raw > $out/$name.multi$control.got
			if cmp -s $out/$name.multi$control.got tests/native/$name.out; then [ -z "$control" ] && echo "$name (one of four in one firmware): ok"
			elif [ -n "$control" ]; then wrong=$((wrong + 1))
			else echo "$name (one of four in one firmware): FAILED"; diff $out/$name.multi.got tests/native/$name.out | head -10; fail=1; fi
		done
		if [ -z "$control" ]; then
			sed -n 's/^hog: //p' $out/multi.raw > $out/hog.multi.got
			if [ "$(tail -1 $out/hog.multi.got)" = "log crashed: out of memory" ]; then
				echo "hog (with them, at mem_kb ${NW_MEM_KB:-320}): crashed alone, out of memory, after $(grep -c '^reply' $out/hog.multi.got) asks;" \
					"$(sed -n 's/^fw: memory hog loaded \([0-9]*\) blocks-peak \([0-9]*\) .*/\1 bytes loaded, blocks at most \2/p' $out/multi.raw)"
			else echo "hog (with them, at mem_kb ${NW_MEM_KB:-320}): FAILED, it did not run out of memory"; tail -3 $out/hog.multi.got; fail=1; fi
		fi
		if [ -n "$control" ]; then
			if [ $wrong -gt 0 ]; then echo "control, the runtime's state not swapped: $wrong of 4 worlds wrong, as they should be"
			else echo "control, the runtime's state not swapped: FAILED (every world right: the test does not test the swap)"; fail=1; fi
		fi
	done
	exit $fail
fi
if [ -n "$UNITS" ] && [ -z "$ROOTSTACK" ]; then   # (task 9: a root stack overflow is a clean crash)
	node cji.js tools/rv32/fw/deep.world.js --world-unit --emit > $out/deep.own.slir
	node tools/link-units.mjs build/rv32/unit/prelude-unit.slir $out/deep.own.slir > $out/deep.slir
	./slas --snapshot-out $out/deep.snap $ext $out/deep.slir 2> $out/deep.slas.log
	./slas-rv32 -c $out/deep.so --module $ext --snapshot $out/deep.snap $out/deep.slir 2>> $out/deep.slas.log
	set +e
	build/rv32/rv32emu $fw $out/deep.so -- NW_SELF=deep start ask down '{"n":100}' ask down '{"n":1000}' > $out/deep.got 2>&1
	set -e
	if cmp -s $out/deep.got tools/rv32/fw/deep.out; then echo "deep (4 KB root stack): ok, 100 deep fits, 1,000 deep crashes cleanly"
	else echo "deep (4 KB root stack): FAILED"; diff $out/deep.got tools/rv32/fw/deep.out | head -10; fail=1; fi
fi
# the loader and the fake kernel against a module built the board's way: C with sdk/nw_elf.c, -fPIC
# -fvisibility=hidden, linked -shared -e app_main -z max-page-size=16 --strip-all (as picocalc-os's CMake
# builds natives/*.c, with clang and ld.lld for riscv32-esp-elf-gcc)
cl="clang --target=riscv32-unknown-elf -march=rv32imafc -mabi=ilp32f -Os -fPIC -fvisibility=hidden -ffunction-sections
	-fdata-sections -nostdinc -isystem $(clang -print-resource-dir)/include -isystem tools/rv32/fw/include -I$pc/sdk"
$cl -c tools/rv32/fw/ref_module.c -o $out/ref_module.o
$cl -c "$pc/sdk/nw_elf.c" -o $out/nw_elf.o
ld.lld -m elf32lriscv -shared -e app_main --gc-sections -z max-page-size=16 --strip-all -o $out/ref_module.so \
	$out/ref_module.o $out/nw_elf.o
set +e
build/rv32/rv32emu $fw $out/ref_module.so -- NW_SELF=ref start ask ping null > $out/ref_module.got 2>&1
set -e
if cmp -s $out/ref_module.got tools/rv32/fw/ref_module.out; then echo "ref_module (C, ld.lld): ok"
else echo "ref_module (C, ld.lld): FAILED"; diff $out/ref_module.got tools/rv32/fw/ref_module.out | head -10; fail=1; fi
exit $fail
