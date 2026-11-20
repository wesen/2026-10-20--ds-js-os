#!/usr/bin/env bash
set -euo pipefail
src=$(cd "$(dirname "$0")" && pwd)
root=$(git rev-parse --show-toplevel)
cc -O2 -g -std=gnu11 -I "$root/picocalc-os/third_party/quickjs" \
  "$src/03-native-qjs.c" "$src/01-typed-lex-index.c" "$root"/picocalc-os/build/qjs/*.o -lm -lpthread -o "$1"
