#!/bin/sh
# CJI-4, part 2 (CJI-3 phase C, step 10): a world compiled on the emulated board. For each world named in
# tests/native/*.events (WORLDS="a b" for a subset), stage 1 (the compiler compiled by cji, assembled by slas-rv32
# and linked into the test firmware build/rv32/fw-stage1.elf) compiles the world's source on the rv32 emulator, alone
# against the world runtime's unit (--world-unit); its SLIR must equal stage 0's on the host (node cji.js --world-unit
# --emit) byte for byte.
#
#   sh tools/rv32/compile-test.sh       (HEAP=bytes: stage 1's heap to start with, 4 MB by default)
#
# Logs in build/rv32/compile: NAME.host.slir, NAME.board.slir, NAME.board.err (the collector's figures and the
# instructions the compile took; the clock reads the instruction count, at 400 MHz).
set -e
here=$(cd "$(dirname "$0")/../.." && pwd)
pc=${PICOCALC:-$here/../../firmware}
cd "$here"
make -s rv32-stage1 PICOCALC="$pc" > /dev/null
out=build/rv32/compile
mkdir -p $out
fail=0
for ev in tests/native/*.events; do
	name=$(basename "$ev" .events)
	if [ -n "$WORLDS" ]; then case " $WORLDS " in *" $name "*) ;; *) continue ;; esac; fi
	file=$(head -1 "$ev")
	case "$file" in tests/*) src=$here/$file ;; *) src=$pc/../apps/js/picocalc/$file ;; esac
	node cji.js "$src" --world-unit --emit > $out/$name.host.slir
	set +e
	RV32_STEPS=1 RV32_SIZES=1 RV32_CLOCK=1 build/rv32/rv32emu build/rv32/fw-stage1.elf -- -g -h ${HEAP:-4194304} -- "$src" --world-unit \
		> $out/$name.board.slir 2> $out/$name.board.err
	status=$?
	set -e
	figures=$(sed -n 's/^cji: \(.*\)$/\1/p' $out/$name.board.err)
	if [ $status = 0 ] && cmp -s $out/$name.host.slir $out/$name.board.slir; then
		echo "$name: stage 1 on the board = stage 0 on the host ($(wc -c < $out/$name.host.slir) bytes of SLIR; $figures)"
	else echo "$name: FAILED (status $status)"; tail -3 $out/$name.board.err; cmp $out/$name.host.slir $out/$name.board.slir | head -2; fail=1; fi
done
exit $fail
