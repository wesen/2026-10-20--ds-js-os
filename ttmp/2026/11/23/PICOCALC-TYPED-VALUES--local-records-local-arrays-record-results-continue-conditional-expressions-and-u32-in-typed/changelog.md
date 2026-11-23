# Changelog

## 2026-11-23

- Initial workspace created

## 2026-11-23

continue, ?: and u32 in the front end, the tape (5 Wasm rows, pseudo-op f32.to_u32), Wasm and RV32; the P4 lexical index learns ? (83dadd8)

## 2026-11-23

More than eight parameters per register class: ilp32f stack words, the caller's stack-argument area, the callee's prologue copy (57d70b9)

## 2026-11-23

Value records (value record Name {...}, scalar-replaced in the front end) and record results (Wasm multi-value; RV32 a0-a7/fa0-fa7 and caller stack words); inline handles record-result callees (4a859bd)

## 2026-11-23

Local arrays: new Int32Array/Uint32Array/Float32Array(n), array.address and array.zero, RV32 frame area, static Wasm area; [ ] in the P4 lexical index (f0bdcfd)

## 2026-11-23

Counted loops remove their counter's array checks in the front end (6a64515); main merged (71f1478); host compile-time measurement (scripts/06-compile-time.mjs)
