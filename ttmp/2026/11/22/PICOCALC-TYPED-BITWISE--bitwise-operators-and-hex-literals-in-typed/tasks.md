# Tasks

## Done

- [x] Verify the design against the code; append Refinements
- [x] Tape rows i32.and/or/xor/shr_u; tokens, precedence, ~, hex literals in the front end
- [x] The P4 lexical index tokenizes the new tokens (host QuickJS check)
- [x] RV32: and/or/xor/srl, andi/ori/xori/srli; the passes' opcode ranges, value-sets folding, ranges rules
- [x] Differential test (Wasm, RV32 under five policies, JavaScript); pcgH on 10,000 inputs (and against g++)
- [x] Byte identity (84 of 84), make test, make test-host default and kernel

## Open

- [ ] Fold `-literal` into one i32.const (moves existing images)
- [ ] Run the C lexical index change on the board with a source that uses the operators
