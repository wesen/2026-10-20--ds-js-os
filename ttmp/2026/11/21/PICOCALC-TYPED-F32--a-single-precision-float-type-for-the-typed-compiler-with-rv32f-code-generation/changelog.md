# Changelog

## 2026-11-21

- Initial workspace created

## 2026-11-22

f32 end to end (b2773a5): language, tape rows and three pseudo-ops, Wasm, RV32F on an f operand stack; differential tests on the reference interpreter and the Go machine

## 2026-11-22

Math library in Typed (1-3 ulp, powf 21-48) and f32-only code generation: fragments at 1.49/1.31/1.30x GCC -O2 instructions, bit-exact with -ffp-contract=off (88d11bd)

## 2026-11-22

Board study: Typed/GCC -O2 cycles sphere 1.33, ggx 1.26, norm3 1.17, bit-exact; compile-time trims (lexer regexp, integer fast paths); docs, refinements, diary
