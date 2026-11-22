# Questions for the article "5. Code Generation: From a Stack Machine to a Register Machine"

1. Translate `x = y + 1` (three WebAssembly operations: `local.get y`, `i32.const 1`, `i32.add`, then `local.set x`) the way the current backend does, with `y` at offset 0, `x` at offset 4 and operand-stack slots at offsets 8 and 12. Count the instructions.
2. Translate the same statement using a compile-time operand stack with lazy constants and locals. Show the list after each operation and count the instructions.
3. Why must pending values be moved to agreed locations before a join? State whether this is a matter of correctness or of code quality, and why.
4. Why does the current backend emit a conditional branch followed by an unconditional jump for every `if`, and what does the measurement in section 5.3 say about how often that is necessary?
5. The counting model reproduces today's instruction count exactly for all 161 functions. What does that establish, and what does it leave unproven about the predictions for models A and B?
6. Name two things in the hand-written loop of section 5.9 that a one-operation-at-a-time translator cannot produce, and say what kind of knowledge each requires.
