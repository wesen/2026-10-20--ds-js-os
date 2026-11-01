#!/bin/sh
# Copy the part of WAMR (WebAssembly Micro Runtime) that picocalc-os builds into third_party/wamr, from a checkout of
# the release named in third_party/wamr/VERSION, then apply third_party/wamr/patches/*.patch.
#   git clone --depth 1 -b WAMR-2.4.5 https://github.com/bytecodealliance/wasm-micro-runtime /path/to/wamr
#   tools/vendor-wamr.sh /path/to/wamr
# The subset: the fast interpreter and its loader, the common runtime, the memory allocator, the utilities, and the
# platform layers for Linux (the host) and ESP-IDF (the P4). No AOT, JIT, WASI or libc-builtin.
set -eu
SRC=${1:?usage: tools/vendor-wamr.sh /path/to/wasm-micro-runtime}
DST=$(cd "$(dirname "$0")/.." && pwd)/third_party/wamr
test -f "$SRC/core/iwasm/include/wasm_export.h" || { echo "$SRC is not a WAMR checkout" >&2; exit 1; }
rm -rf "${DST:?}/core"
mkdir -p "$DST"
cp "$SRC/LICENSE" "$SRC/ATTRIBUTIONS.md" "$DST/"
copy() { for f in "$@"; do mkdir -p "$DST/$(dirname "$f")"; cp -r "$SRC/$f" "$DST/$f"; done; }
copy core/config.h core/version.h \
     core/iwasm/include \
     core/iwasm/common/wasm_application.c core/iwasm/common/wasm_blocking_op.c core/iwasm/common/wasm_c_api.c \
     core/iwasm/common/wasm_c_api_internal.h core/iwasm/common/wasm_exec_env.c core/iwasm/common/wasm_exec_env.h \
     core/iwasm/common/wasm_loader_common.c core/iwasm/common/wasm_loader_common.h core/iwasm/common/wasm_memory.c \
     core/iwasm/common/wasm_memory.h core/iwasm/common/wasm_native.c core/iwasm/common/wasm_native.h \
     core/iwasm/common/wasm_runtime_common.c core/iwasm/common/wasm_runtime_common.h \
     core/iwasm/common/wasm_shared_memory.c core/iwasm/common/wasm_shared_memory.h core/iwasm/common/wasm_suspend_flags.h \
     core/iwasm/common/arch/invokeNative_em64.s core/iwasm/common/arch/invokeNative_riscv.S \
     core/iwasm/interpreter/wasm.h core/iwasm/interpreter/wasm_interp.h core/iwasm/interpreter/wasm_interp_fast.c \
     core/iwasm/interpreter/wasm_loader.c core/iwasm/interpreter/wasm_loader.h core/iwasm/interpreter/wasm_opcode.h \
     core/iwasm/interpreter/wasm_runtime.c core/iwasm/interpreter/wasm_runtime.h \
     core/iwasm/aot/aot_runtime.h core/iwasm/aot/aot_intrinsic.h core/iwasm/aot/aot_perf_map.h \
     core/iwasm/compilation/aot.h \
     core/shared/utils core/shared/mem-alloc \
     core/shared/platform/include core/shared/platform/linux core/shared/platform/esp-idf \
     core/shared/platform/common/posix core/shared/platform/common/libc-util core/shared/platform/common/math
find "$DST/core" \( -name '*.cmake' -o -name SConscript \) -delete
rm -rf "$DST/core/shared/utils/uncommon"
for p in "$DST"/patches/*.patch; do [ -f "$p" ] && patch -s -d "$DST" -p1 < "$p"; done
echo "vendored $(find "$DST/core" -type f | wc -l) files into $DST"
