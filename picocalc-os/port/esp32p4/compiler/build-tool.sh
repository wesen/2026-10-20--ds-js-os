#!/bin/sh
# Build a closed RV32 shared object. No host calls or firmware symbols are imported.
set -eu
c=$(realpath "$1")
out=$(realpath -m "$2")
here=$(dirname "$(realpath "$0")")
mkdir -p "$out/inc"
make -C "$c" build/rv32/stage1/stage1-ilp32.o
fw=$c/tools/rv32/fw
sljit=$c/runtime/sljit
sed -e '/#include <features.h>/d' -e 's/^__BEGIN_DECLS$//' -e 's/^__END_DECLS$//' /usr/include/elf.h > "$out/inc/elf.h"
compile() {
 clang --target=riscv32-unknown-elf -march=rv32imc -mabi=ilp32 -Os -nostdinc \
    -isystem "$(clang -print-resource-dir)/include" -isystem "$fw/include" \
    -I"$out/inc" -I"$c/runtime" -I"$sljit" -I"$here" -fPIC -fvisibility=hidden \
    -fstack-usage -ffunction-sections -fdata-sections -fno-builtin -mno-relax "$@"
}
profile_flag=
if [ "${3:-OFF}" = ON ]; then profile_flag=-DCJI_PROFILE_GC; fi
for name in runtime libc softfloat tool; do
 case $name in runtime) file=$c/runtime/runtime.c;; tool) file=$here/tool.c;; *) file=$fw/$name.c;; esac
 compile $profile_flag -c "$file" -o "$out/$name.o"
done
sed -n '/^[[:space:]]*\.globl setjmp/,/^[[:space:]]*\.globl _start/{/\.globl _start/d;p;}' "$fw/hostcalls.S" > "$out/jump.S"
compile -c "$out/jump.S" -o "$out/jump.o"
for name in slas sljitLir; do
 case $name in slas) file=$c/runtime/slas.c;; *) file=$sljit/sljitLir.c;; esac
 compile -w -DCJI_BOARD -DCJI_RV32 -Dmain=slas_main -Derror_shape=slas_error_shape \
    -DSLJIT_CONFIG_RISCV_32=1 -DSLJIT_CONFIG_RISCV_COMPRESSED=200 -DSLJIT_EXECUTABLE_ALLOCATOR=0 \
    -DSLJIT_UTIL_STACK=0 -DSLJIT_IS_FPU_AVAILABLE=0 -DSLJIT_ARGUMENT_CHECKS=1 \
    -include "$fw/board_exec.h" -c "$file" -o "$out/$name.o"
done
cd "$out"
linker=$(command -v ld.lld || true)
if [ -z "$linker" ] && command -v rustc >/dev/null; then
    linker="$(rustc --print target-libdir)/../bin/gcc-ld/ld.lld"
fi
if [ ! -x "$linker" ]; then echo "install LLVM lld to build the compiler tool" >&2; exit 1; fi
"$linker" -m elf32lriscv --shared -Bsymbolic --gc-sections --no-relax -z notext \
    -z max-page-size=16 --no-undefined --strip-all -e compiler_entry \
    tool.o runtime.o libc.o softfloat.o jump.o slas.o sljitLir.o \
    "$c/build/rv32/stage1/stage1-ilp32.o" -o compiler.elf
