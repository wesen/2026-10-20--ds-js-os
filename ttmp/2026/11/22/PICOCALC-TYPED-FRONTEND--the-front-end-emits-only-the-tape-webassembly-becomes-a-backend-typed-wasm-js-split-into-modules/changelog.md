# Changelog

## 2026-11-22

- Initial workspace created

## 2026-11-22

The front end writes only the tape (380140d); the Wasm backend serializes it with encodeFunction, byte-identical (123/123 digests). typed-wasm.js is built from frontend/ and wasm/ by compiler/typed/frontend/build.mjs (427a7de), --check in make test-generated. Serializer fast paths and a phase-swept QuickJS heap measure (bb46eb3): Editor RV32 compile 0.99x time, 0.998x peak; Wasm world peak 0.65x. Docs and diary (883d133); merged main 9be534a, file-length entry for the generated bundle (77ba9d9).
