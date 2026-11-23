# Changelog

## 2026-11-22

- Initial workspace created

## 2026-11-22

Register classes (x 0-31, f 32-63) through the planner and emitter with ilp32f tables; one instruction table (85 rows: RV32IM, Zicsr, RV32F, PIE) cross-checked against GNU as; typed-pie-loops.js encodes through it; encoders made on first use. 84/84 digests and PIE images identical; make test, test-host default and kernel 24/24; Editor interactive compile +0.45% instructions in bare QuickJS (commits 4f687cf, 024e697, f9d9031, df6d842).
