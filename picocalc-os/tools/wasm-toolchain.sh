#!/bin/sh
# The WebAssembly toolchain for the example modules (make natives), without installing anything: Ubuntu 24.04's
# wasm-ld (lld-18), wasi-libc, libc++ and compiler-rt for wasm32, downloaded with apt-get and unpacked into
# build/wasm-toolchain, which the Makefile then uses with the system's clang 18. With root, install them instead:
#   sudo apt install lld-18 wasi-libc libc++-18-dev-wasm32 libc++abi-18-dev-wasm32 libclang-rt-18-dev-wasm32
set -eu
OS=$(cd "$(dirname "$0")/.." && pwd)
TC=$OS/build/wasm-toolchain
rm -rf "${TC:?}"
mkdir -p "$TC/debs" "$TC/root" "$TC/res/lib"
(cd "$TC/debs" && apt-get download lld-18 wasi-libc libc++-18-dev-wasm32 libc++abi-18-dev-wasm32 libclang-rt-18-dev-wasm32)
for d in "$TC"/debs/*.deb; do dpkg-deb -x "$d" "$TC/root"; done
ln -s wasm-ld "$TC/root/usr/lib/llvm-18/bin/wasm-ld-18"   # the name clang 18 runs
# clang's resource directory: its own headers, and the package's compiler-rt builtins for wasm32
ln -s "$(clang-18 -print-resource-dir)/include" "$TC/res/include"
ln -s "$TC/root/usr/lib/llvm-18/lib/clang/18/lib/wasi" "$TC/res/lib/wasi"
echo "the WebAssembly toolchain is in $TC"
