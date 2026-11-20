# Changelog

## 2026-11-19

- Initial workspace created

## 2026-11-19

Wrote the implementation plan: eight design documents with 41 tasks (A0-A8, B1-B2, C1, D1-D2, E1-E9, F1-F6, G1-G4, M1-M2, H1-H6), a host replay runner (24 checks pass) and a staged counting model (Files 732/668/593, Agenda 2,789, Editor 16,544; model B 470/2,418/13,255). No source code changed.

## 2026-11-20

E1–E4, E6–E7 and G1–G3 are qualified. The [language fixture results](../PICOCALC-LANGUAGE-E--control-flow-forward-calls-enums-and-distinct-integers/various/differential.json) cover both compilation modes. The [register-lowering experiment](../PICOCALC-LANGUAGE-E--control-flow-forward-calls-enums-and-distinct-integers/various/register-inequality-execution.json) executes both inequality spellings. The [Open-only checkpoint](../PICOCALC-EG-QUAL--implement-and-qualify-the-typed-language-and-asynchronous-editor-on-the-picocalc/various/host-open.json) passed all 24 frozen application replays. E5 and G4 remain under integrated qualification in [the supervisor's ticket](../PICOCALC-EG-QUAL--implement-and-qualify-the-typed-language-and-asynchronous-editor-on-the-picocalc/index.md).

E5 and G4 passed on integrated compiler `e0ad43b`. Native and Wasm cold Editor medians were 2.606 s and 1.935 s. The final 64 KiB early, missed and late queries completed on each physical engine. [Integrated acceptance receipt](../PICOCALC-EG-QUAL--implement-and-qualify-the-typed-language-and-asynchronous-editor-on-the-picocalc/various/final-acceptance.json)
