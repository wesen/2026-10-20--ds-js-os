# Tasks

## TODO
- [x] Merge PICOCALC-COMPILE-CACHE (subagent branch), rerun make test and the host gates <!-- t:4j9n -->
- [x] Merge PICOCALC-TYPED-VALUES (subagent branch), rerun make test and the host gates <!-- t:ajls -->
- [x] Merge PICOCALC-COMPILER-DEVICE-COST (subagent branch), rerun make test and the host gates <!-- t:drer -->
- [x] Merge PICOCALC-BOARD-HARNESS (subagent branch), rerun make test and the host gates <!-- t:r8kg -->
- [x] Merge PICOCALC-CANDELA-KERNEL-CODEGEN (subagent branch), rerun make test and the host gates <!-- t:sxvf -->
- [x] Vault report 1: boot without compiling <!-- t:oe6z -->
- [x] Vault report 2: value types in a streaming compiler <!-- t:b3zy -->
- [ ] Follow-up: a test that parses every playable.py subcommand (restore lacked --health-only) <!-- t:2cdx -->
- [ ] Follow-up: Test the PSRAM hypothesis: the gallery worker's stack and the Typed module in internal RAM (host 1.41x vs P4 2.03x kernel-bound) <!-- t:gk5j -->
- [ ] Follow-up: Cold-compile speed: front end, location planner, emitter (Chess at 72-73 % of its deadline cold) <!-- t:8ziz -->
- [ ] Follow-up: typed cache clear must cancel a queued or running write <!-- t:odoq -->
- [ ] Follow-up: Health after the cache writer has run (health is judged at about 10 s uptime) <!-- t:a4g3 -->
- [ ] Follow-up: Kernel profile next items: f32 constants (about 560 per sample on B-01), callee-saved saves and restores (about 510) <!-- t:mqo1 -->
- [ ] Follow-up: Wasm inspection of 0xfc-prefixed operations <!-- t:06zc -->
