# Tasks

## TODO
- [x] continue, ?: and u32 on both targets with differential tests (83dadd8) <!-- t:ia6c -->
- [x] More than eight parameters per register class: ilp32f stack words (57d70b9) <!-- t:hrg3 -->
- [x] Value records: declarations, constructors, locals, fields, parameters (scalar replacement) <!-- t:e9ai -->
- [x] Record results: Wasm multi-value, RV32 a0-a7/fa0-fa7 and a stack area <!-- t:pkh7 -->
- [x] Inline pass: callees with record results <!-- t:kcn6 -->
- [x] Local arrays: Int32Array/Uint32Array/Float32Array in the frame, checked and unchecked indexing <!-- t:2kj6 -->
- [x] Device lexical index tokenizes the new syntax (checked on a host QuickJS) <!-- t:3ufz -->
- [x] docs/typed-compiler.md language section <!-- t:1x9j -->
- [ ] Device check: playable build from the branch, boot apps within 75% of deadlines, restore from main <!-- t:ooy6 -->
- [ ] continue inside an async function's own body parser (async/body.js) <!-- t:kd4t -->
- [ ] Value records and local arrays inside async functions (the async lowering's own parser) <!-- t:73ef -->
- [ ] RV32 array access: fold the area offset into the load or store (slli; add sp; lw off), one instruction less <!-- t:cd3w -->
- [ ] storeless and fields: a store into the function's own local array is not visible to callers <!-- t:pvm7 -->
- [ ] Wasm inspection: decode 0xfc-prefixed operations (memory.fill, trunc_sat; predates this ticket) <!-- t:5jdb -->
- [ ] Front end: recover the 1-7% QuickJS compile time the new checks cost programs that use none of the features <!-- t:9s9y -->
