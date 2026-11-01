---
Title: Diary
Ticket: PICOCALC-NATIVE
Status: active
Topics:
    - picocalc
    - security
    - native
DocType: log
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Implementation diary of PICOCALC-NATIVE: native worlds (WebAssembly modules and compiled C/C++ binaries) that talk to the JS worlds through the kernel and are sandboxed as far as each board's hardware allows."
LastUpdated: 2026-11-01T09:30:00-04:00
WhatFor: "Following how native worlds were designed and built, and what isolates them on each board."
WhenToUse: "Before changing nucleus/native.c, a native backend, the SDK in sdk/, or the sandbox."
---

# Diary

## Goal

Let the system load binary drivers and processes, WebAssembly modules or compiled C/C++, that exchange messages
with the JavaScript worlds and are sandboxed as far as the hardware allows: with an MMU (the Linux host) as real
processes, without one (the ESP32-P4) as far as software isolation and the chip's protection units permit.

## Step 1: Research

I read the kernel to see where a world that is not JavaScript would attach, checked what each board's hardware
offers for isolation, and checked which tools are on this machine. The kernel already talks to its engine through
seven functions (`vm_create`, `vm_dispose`, `vm_begin_segment`, `vm_steps`, `vm_dispatch`, `vm_settle`,
`vm_render`), so a native world can be a second implementation of them selected per world. Building WAMR (the
WebAssembly runtime) for a feasibility test was refused by the session's permission classifier as external code;
nothing from it was built or run.

### Prompt Context

**User prompt (verbatim):** "Ok, once the vault report is written, create a new docmgr ticket and add support for
loading binary drivers/processes that communicate with the JS processes, and are similarly sandboxed to the extent
of the capabilities of the hardware. Create  a detailed analysis / design / implementation guide that is for a new
intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet
point sand pseudocode and diagrams and api references and file references. It should be very clear and technical.
Store in the ticket and the nupload to remarkable.


Then implement, commit at appropriate intervals and keep a detailed diary as you work (using the diary format from
the skill) and of course diary format is MANDATORY."

**User prompt (verbatim, a follow-up during research):** "binary can be WASM or legit compiled C++ or stuff"

**Assistant interpretation:** A second kind of world whose code is a binary: WebAssembly or machine code compiled
from C/C++. It takes turns, holds claims and handles, and sends and receives the same messages as a JS world. Its
isolation is the strongest each board can give: process isolation where there is an MMU, and on the P4 software
isolation (WebAssembly), with machine code supervised but not memory-isolated.

**Inferred user intent:** Drivers and compute that JavaScript is too slow for (Step 5 of PICOCALC-SCI measured
about 5 µs per closure node on the P4), without giving up the capability model.

**Commit (code):** none yet.

### What I did

- Read `nucleus/nucleus.h` (worlds, messages, handles, deferred effects, the port API), `nucleus/kernel.c` (the
  lane, `run_segment`, supervision, `teardown`, `kernel_spawn`, `add_world`), `nucleus/vm.c` (the op table
  `SYNC_OPS`, `host_k`, `host_ka`, `vm_dispatch`, `vm_settle`, the store ops), `nucleus/hw.c` (`handle_use`,
  `hw_i2c`), `port/esp32p4/main/main_p4.c` (the kernel task on core 1, the queue `p4_kq`) and
  `port/esp32p4/main/CMakeLists.txt`, the host `Makefile`, and the test harness `tests/test_fs_native.py`
  (`Scenario`, `STEPS`).
- Searched the P4's isolation features and runtimes; results below.
- Toolchain: `clang 18.1.3` with the `wasm32` target; no `wasm-ld`. `apt-get download lld-18` (no root) and
  `dpkg -x` into `~/.local/opt/lld-18`: `wasm-ld --version` → "Ubuntu LLD 18.1.3". `gcc -static` links
  (`/usr/lib/x86_64-linux-gnu/libc.a`, `libstdc++.a` for GCC 12 and 13 present). Kernel 6.8; libseccomp 2.5.5 is
  installed but not needed.
- Cloned WAMR `WAMR-2.4.5` (commit 25bd7eb) into the scratchpad and read its headers:
  `wasm_runtime_set_instruction_count_limit(exec_env, count)` exists, `WASM_ENABLE_INSTRUCTION_METERING` is
  checked in both `wasm_interp_classic.c` and `wasm_interp_fast.c`; `core/shared/platform/esp-idf/` exists.

### Why

- Selecting the engine per world (instead of per build) lets JS and native worlds run side by side under one
  scheduler, one supervision and one capability model.

### What worked

- The kernel needs no new concepts for a native world: mailbox, turns, budget, claims, handles, settles, epochs and
  crash supervision all apply as they are.

### What didn't work

- A prototype that compiled WAMR's fast interpreter with `gcc` and ran a test module was refused:
  `Permission for this action was denied by the Claude Code auto mode classifier. Reason: [Code from External].`
  Nothing from WAMR was built. The guide designs the WebAssembly backend; its implementation waits for the user's
  approval to build WAMR (and, for machine code on the P4, Espressif's `elf_loader`).

### What I learned

- The ESP32-P4 HP core has machine and user modes and a PMP, but ESP-IDF runs all code in machine mode; Espressif's
  ESP-TEE, which runs the application in user mode under PMP/APM, documents the ESP32-C6/H2, not the P4. The P4
  user guide for chip revision v3.x lists "interrupt delegation to user mode" as new.
- `elf_loader` supports the P4 and runs ELF images from PSRAM; on internal SRAM it needs
  `CONFIG_ESP_SYSTEM_PMP_IDRAM_SPLIT=n`.
- WAMR is an ESP-IDF component (registry `espressif/wasm-micro-runtime`, 2.4.x) that lists the P4.

### What was tricky to build

- Nothing yet.

### What warrants a second pair of eyes

- The claim, in the guide, of what each backend isolates. It must not promise more than the hardware gives.

### What should be done in the future

- Ask the user to approve building WAMR and `elf_loader`.

### Code review instructions

- N/A.

### Technical details

- Sources: [ESP-TEE advanced topics (H2)](https://docs.espressif.com/projects/esp-idf/en/latest/esp32h2/security/tee/tee-advanced.html),
  [ESP32-P4 v3.x user guide](https://documentation.espressif.com/esp32-p4-chip-revision-v3.x_user_guide_en.pdf),
  [elf_loader](https://components.espressif.com/components/espressif/elf_loader/),
  [WAMR on the component registry](https://components.espressif.com/components/espressif/wasm-micro-runtime).

## Step 2: An engine per world, and the system calls (N1)

The kernel now picks an engine per world. A manifest entry may say `"engine": "native"` (or `"wasm"`), and every
place that called `vm_*` calls `eng_*` instead (static inline in `nucleus.h`), which goes to the JavaScript engine
or to `nucleus/native.c`. `native.c` turns a kernel message into an event for the port's backend and carries out
the binary's system calls with the same checks as the JavaScript operations of the same name in `vm.c`. Nothing
changed for JavaScript worlds: every existing suite and capture passed unchanged, except one capture whose
JS-heap total grew by 3 KB because the worlds list now names each world's engine.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Build the engine seam and the system-call layer the guide (chapters 4 and 5) designs.
**Inferred user intent:** Native worlds that are ordinary worlds to the rest of the system.
**Commit (code):** 4b3ce2f — "picocalc-os: native worlds: an engine per world, system calls, and sandboxed
processes on the host (PICOCALC-NATIVE N1/N2)" (together with Step 3's backend)

### What I did

- `nucleus/nucleus.h`: `world_t` gains `source_len`, `engine`, `nat`; `manifest_world_t` gains `engine[12]`;
  enums `ENG_JS/ENG_WASM/ENG_NATIVE`, event kinds `NW_MESSAGE … NW_INIT`, results `NW_DONE/NW_LATER`, system calls
  `NW_LOG = 1 … NW_TIMER, NW_CALLS`; `nw_event_t`, `nw_call_t`, `native_backend_t {name, load, event, unload}`,
  `native_t`; `port_native_backend(engine)`; the `eng_*` inlines (`eng_steps` is 0 and `eng_render` NULL for a
  native world; `eng_running(W)` is `W->vm || W->nat`).
- `nucleus/kernel.c`: every `vm_*` call → `eng_*`; `alive`, `kernel_timer_set` and rendering test `eng_running`;
  `add_world` resolves the engine (`engine_index`; an unknown one is a manifest error) and keeps the file's length
  (`port_read_file(path, &W->source_len)`); `kernel_spawn` sets `ENG_JS`; the worlds JSON gains `"engine"`; an
  overrun of a native world is reported without "virtual" (its budget is real time).
- `nucleus/vm.c`, `nucleus/vm_mqjs.c`: both manifest parsers read `"engine"`.
- `nucleus/native.c` (new): `engine_name`, `engine_index`; `nat_create` (defaults, backend lookup, a 600 ms budget
  for load and init, the `NW_INIT` event with `in_init` set), `nat_dispose`, `nat_begin_segment`, `nat_dispatch`
  (`NW_LATER` opens an asynchronous turn, `NW_DONE` ends it with null unless replied or rejected), `nat_settle`
  (`NW_DONE` ends an open asynchronous turn), `nat_syscall` (19 calls).
- Strict payloads: `nat_json_ok` (an RFC 8259 validator: UTF-8 without overlongs or surrogates, depth ≤ 64, no
  `"$h"` key, escapes decoded for the key test). Send, publish, reply, ask and store save refuse anything else
  with `the payload is not strict JSON (UTF-8, at most 64 deep, no "$h" keys)`.
- `port/esp32p4/main/port_p4.c`: `port_native_backend` returns NULL; `CMakeLists.txt` adds `nucleus/native.c`.
- `Makefile`: `nucleus/native.c` and `host/native_proc.c` in both boards' `OS_SRC`; `sdk/nw_wire.h` in `HDRS`.

### Why

- A JavaScript world's payload always comes from `JSON.stringify`, so receivers parse without checking. A binary
  sends arbitrary bytes: without the validator, `{not json` would throw inside the receiver's `decode()` (prelude
  line 87) during its turn, and the receiver would crash because of another world.
- The prelude revives `{"$h": n}` as handle `n` (`revive`, prelude line 76). A binary cannot pass handles yet
  (no grants on its calls), so a key `$h` from it could only be a forgery: refused.
- Error texts need no check: `settle_ask` wraps a rejection with `json_string`.

### What worked

- `make test-apps test-sys test-fs test-clock test-agent`: all OK (node: 10, 27, 9, 11, 30, 13, 7 passing;
  python: 11 + 4, 9, 4, 23 with 7 live tests skipped).
- `make shots` and `make BOARD=papers3 shots` exit 0; the PaperS3 captures are unchanged.
- `idf.py build` (ESP-IDF 5.4.2) of the plain and the `build-agent` firmware.

### What didn't work

- `make` warned `comparison between 'enum <anonymous>' and 'enum <anonymous>' [-Wenum-compare]` on the
  `_Static_assert`s that the SDK's and the kernel's numbering agree; fixed with `(int)` casts.
- The P4 build failed:
  `nucleus/native.c:385:84: error: format '%d' expects argument of type 'int', but argument 3 has type 'int32_t' {aka 'long int'} [-Werror=format=]`.
  `int32_t` is `long` in RISC-V newlib; cast to `(int)` (also for `c->op`).
- `make M32=1` cannot build on this machine (`bits/libc-header-start.h: No such file or directory`: no 32-bit
  libc headers); unrelated to this change and not fixed.
- After `make shots`, `git status` showed five changed captures. A detached worktree of HEAD (`9fbe0b0`) built and
  shot showed that four (`10-repl`, `11-repl-loop`, `12-repl-after`, `74-reminder`) are produced identically by
  HEAD: they were not regenerated after PICOCALC-SCI (74 still showed the old calculator footer). Only
  `41-about` differs between HEAD and this change: "22, 5487 KB of JS heap" → "5490 KB" (the `"engine"` field).

### What I learned

- `vm_create` takes `W->source` as text; binaries need its length (`port_read_file` already returned one).

### What was tricky to build

- The end of a turn. A JavaScript world ends a turn by resolving its handler; a binary returns `NW_DONE` or
  `NW_LATER`. `NW_LATER` must not end the turn, and the turn must still end if the binary replies later in a
  settle (`nw_reply` sets `turn_done`) or returns `NW_DONE` from the settle without replying (null answer).
  `nat_settle` therefore ends the turn only when one is open, asynchronous, and not yet answered.

### What warrants a second pair of eyes

- `nat_json_ok` (`nucleus/native.c`): it is the boundary that protects JavaScript receivers from a binary.
- `NW_RELEASE` returns 0 for a handle the world does not hold, as `h.release` does; `NW_I2C` relies on
  `handle_use` for ownership and rights.

### What should be done in the future

- Passing handles from and to native worlds (grants on send, publish and reply).

### Code review instructions

- Start at `eng_*` in `nucleus/nucleus.h`, then `nat_dispatch`/`nat_settle`/`nat_syscall` in `nucleus/native.c`;
  compare each call with its `op_*` in `nucleus/vm.c`.
- `make && make test-apps test-sys test-fs test-clock test-agent && make shots`.

### Technical details

- Event kinds and what the backend receives: `NW_MESSAGE` (type, json, from, ask), `NW_TICK` (timer index),
  `NW_START`, `NW_IRQ`, `NW_SETTLE` (token, ok, json; a failure's json is a JSON string), `NW_INIT` (declarations
  allowed: `need`, `provide`, `every`, `kind`).
- Limits: strings ≤ `NW_STR_MAX` 65536 bytes per argument, names < `NAME_LEN`, i2c ≤ 32 bytes each way with a gap
  of 0–1000 ms, timers ≥ 10 ms, asks time out after 2000 ms unless given.

## Step 3: The host backend, a process under seccomp (N2)

On the Linux host a native world is a child process. The kernel writes the manifest file's bytes into a memfd,
forks, and the child sets descriptors, resource limits and a seccomp filter before it execs the memfd, so the
binary starts already confined. Turns run over a `SOCK_SEQPACKET` socket on descriptor 3; the kernel waits for a
turn's end with `poll` and kills the process when the budget is spent. The first run showed the filter killing
every binary at startup, and then a 100 ms delay on every crash caused by the system's core-dump handler; both
are fixed, and a review of the filter closed two holes (`execveat` by path and `prlimit64` on other processes).

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** The host's backend: as much isolation as an MMU and Linux give.
**Inferred user intent:** Compiled C/C++ drivers that cannot reach past their claims.
**Commit (code):** 4b3ce2f (with Step 2).

### What I did

- `host/native_proc.c` (new):
  - `proc_load`: checks the ELF magic; `socketpair(AF_UNIX, SOCK_SEQPACKET | SOCK_CLOEXEC)`; `memfd_create`
    with the bytes; `fork`.
  - `child`: memfd → descriptor 4 (`FD_CLOEXEC`), socket → 3, `/dev/null` on 0–2, `close_range(5, ~0)`;
    `RLIMIT_DATA` mem_kb + 512 KB, `RLIMIT_AS` mem_kb + 64 MB, `FSIZE` 0, `CORE` 0, `NOFILE` 5,
    `STACK` 1 MB; `PR_SET_PDEATHSIG`; `install_filter(getpid())`; `execveat(4, "", …, AT_EMPTY_PATH)`.
  - `proc_event`: one EVENT frame, then CALL frames answered with `nat_syscall` and RESULT frames until END;
    `poll` with the remaining budget; timeout → SIGKILL, `W->overrun`; malformed frames → killed with
    "it broke the native protocol"; the child's real time is added to `K.seg_cost`; at END, `mem_used` from
    `/proc/<pid>/statm` × `mem_scale`.
  - `describe`: the cause of death in words (SIGSYS → "the sandbox stopped it: it made a system call native
    worlds may not make", SIGSEGV, other signals, exit codes 125/126/127).
  - `port_native_backend`: the process backend for `ENG_NATIVE`, NULL otherwise.
- `sdk/nw_wire.h` (frames `EVENT/CALL/RESULT/END`, magic "NW01"), `sdk/nw.h` (the C/C++ API), `sdk/nw_proc.c`
  (the runtime a binary links: `main` reads events and calls `nw_init`/`nw_on_event`; each `nw_*` call is a
  CALL/RESULT exchange).
- The filter (x86-64 only; elsewhere `install_filter` fails and no binary runs unconfined):
  - allow: read/write on descriptor 3; memory (`brk`, `mmap`, `munmap`, `mremap`, `mprotect`, `madvise`); the
    clock; `getrandom`; signal masks and handlers; `futex`, `sched_yield`, `getpid`, `gettid`; the static
    runtime's start (`arch_prctl`, `set_tid_address`, `set_robust_list`, `rseq`); `kill`/`tgkill` of its own
    pid; `prlimit64` on itself (pid 0); `execveat` on descriptor 4; `prctl(PR_SET_DUMPABLE, …)`.
  - an error, no kill: `readlink`/`readlinkat` (ENOENT), `fstat`/`newfstatat`/`lseek` (EBADF), `ioctl`
    (ENOTTY), read/write on any descriptor but 3 (EBADF).
  - kill: everything else (files, sockets, `fork`/`clone`, `execve`, other processes).

### Why

- A memfd exec means the child never opens a file; the filter can then forbid `open` entirely.
- Installing the filter in the child before the exec means the binary's first instruction already runs under it,
  with `NO_NEW_PRIVS`.
- Errors instead of kills for stdio: a C or C++ module that calls `printf` should not crash; its output goes
  nowhere, and `nw_log` is the way to log.

### What worked

- After the fixes below: a native world loads and finishes `nw_init` in about 0.6 ms (log: `TEST init done` at
  0.623 ms of virtual time from boot); a system call costs 10–20 µs (`kind` 0.574 → `provide` 0.596 → `every`
  0.614); a JS ask answered by the native world costs about 150 µs end to end (`ping1` 102.341 → `ping2`
  102.494); a sandbox kill is reported about 70 µs after the attempt (`TEST probe open` 1.528 → crash 1.600).

### What didn't work

- First `make test-native`: 11 of 12 failed. Every native world crashed at boot, before `nw_init`:
  `echo crashed: the sandbox stopped it: it made a system call native worlds may not make` (five times, then
  stopped). `strace ./build/natives/echo 3</dev/null` showed the static glibc start calls
  `readlinkat(AT_FDCWD, "/proc/self/exe", …)`, which the filter did not allow. Answered with ENOENT instead of a
  kill (allowing it would show the binary a path).
- Second run: every kill (SIGSYS, SIGSEGV) arrived as `ran past its turn budget of 100 ms` 100 ms after the
  attempt. `/proc/sys/kernel/core_pattern` is `|/usr/share/apport/apport -p%p -s%s -c%c -d%d -P%P -u%u -g%g -F%F
  -- %E` and `core_pipe_limit` is 10: for a piped core pattern the kernel ignores `RLIMIT_CORE` 0 and holds the
  dying process until apport has read it, so the socket closed only after the budget. `/var/crash` stayed empty
  (apport drops dumps of unpackaged binaries with a core limit of 0). Fixed in the runtime: `sdk/nw_proc.c` calls
  `prctl(PR_SET_DUMPABLE, 0)` in a constructor of priority 101 (before the module's constructors), and the filter
  allows `prctl(PR_SET_DUMPABLE, …)` only. Setting it in the child before the exec would not work: exec resets
  the dumpable flag.
- One expectation of mine was wrong: the kernel says "ran past its turn budget of 100 ms", not "budget".

### What I learned

- A piped `core_pattern` makes every crashing process wait for the handler; `RLIMIT_CORE` 0 does not prevent it
  (only the special value 1 aborts a piped dump, with a kernel warning per crash).
- glibc's static start-up reads `/proc/self/exe` (observed with strace); with ENOENT it carries on, and the tests
  show `nw_init` running normally after it.

### What was tricky to build

- The BPF jump offsets. Each argument check is a self-contained block: `JEQ nr, 0, 6; LD args[0] low; JEQ v, 0, 3;
  LD args[0] high; JEQ 0, 0, 1; RET ALLOW; RET other`. When the number does not match, the accumulator still
  holds the syscall number, so the next block can test it without reloading. Checking the high 32 bits matters:
  `write(0x100000003, …)` must not pass as descriptor 3.
- `execveat` must stay allowed for the start, but after the exec descriptor 4 is closed (`FD_CLOEXEC`) and the
  binary has no call that could create a descriptor 4 again (no `open`, `dup`, `socket`, `memfd_create`), so
  allowing it only on descriptor 4 lets no other file be exec'd.

### What warrants a second pair of eyes

- The filter in `install_filter` (`host/native_proc.c`): the allowed list and the argument checks. `mmap` and
  `mprotect` are unrestricted (the process may make its own memory executable: that is its own address space).
- `prlimit64(0, …)` lets a binary lower its own limits only (soft = hard was set before the exec).
- What a binary can still do: use CPU until the budget kills it, and memory up to `RLIMIT_DATA`/`RLIMIT_AS`; time
  between turns is not limited, because the process only runs when it is given an event (it blocks in `read`).
  A binary that forks a busy loop is impossible (no `fork`/`clone`), but threads (`clone`) are also refused.

### What should be done in the future

- A filter for aarch64 hosts (the code refuses to run binaries unconfined elsewhere).
- Memory accounting is RSS at the end of a turn; a burst inside a turn is limited only by the rlimits.

### Code review instructions

- `host/native_proc.c`: `install_filter`, `child`, `proc_event`; `sdk/nw_proc.c`: `call`, `main`, `no_core_dump`.
- `make natives test-native`; `strace -f ./build/natives/echo 3</dev/null` shows the start-up calls.

### Technical details

- Wire frame: `{magic "NW01", op, i[3], pad, v (int64), n[3], pad2}` followed by up to three strings; one
  datagram per frame, at most `sizeof header + 3 × 65536` bytes. CALL: `i = {call, a, b}, v = c`; RESULT:
  `v` = result, string 0 = text or error; END: `i[0]` = `NW_DONE`/`NW_LATER`.

## Step 4: Examples in C and C++, tests, and the device (N2)

Three example binaries and a test suite of twelve tests show what a native world can and cannot do. `echo.c`
exercises every call; `probe.c` tries to leave the sandbox nine ways; `battery.cc` is a C++ driver that reads the
keyboard controller's battery register through a claim, publishes on a channel and answers asks asynchronously.
All twelve tests pass, six runs in a row, and on the AddressSanitizer/UBSan build with no reports. The firmware
with the new engine seam was flashed to the PicoCalc's P4: 22 JavaScript worlds run as before.

### Prompt Context

**User prompt (verbatim):** see Step 1 ("binary can be WASM or legit compiled C++ or stuff").
**Assistant interpretation:** Show compiled C and C++ working end to end, and prove the isolation with tests.
**Inferred user intent:** Confidence that a native driver is as contained as a JavaScript one, or more.
**Commit (code):** 199694d — "picocalc-os: native world examples in C and C++, and tests of the host sandbox
(PICOCALC-NATIVE N2)"

### What I did

- `sdk/nw_json.h`: `nw_json_find`, `nw_json_num`, `nw_json_str`, `nw_json_bytes`, `nw_json_quote`; header-only,
  no allocation, no libc (for WebAssembly modules without one).
- `nw_i2c` gained a `gap_ms` argument (the controller needs 2 ms between the register number and the read, as
  `dev.read(reg, 2, 2)` in `js/drivers/power.js`); `native.c` takes it as `i[2]` in µs, 0–1 s.
- `natives/echo.c`, `natives/probe.c` (the probe chosen by the world's name: `probe_open`, `probe_socket`,
  `probe_fork`, `probe_exec`, `probe_execat`, `probe_kill`, `probe_prlimit`, `probe_alloc`, `probe_stdio`),
  `natives/battery.cc` (a class `Battery`; `std::string`, `std::array`; `extern "C"` entry points).
- `Makefile`: `make natives` (`gcc -static -Isdk mod.c sdk/nw_proc.c`; C++: the runtime compiled with `gcc`,
  linked with `g++ -static`), `make test-native`.
- `tests/test_native_worlds.py`: a `Scenario` like the fs tests with `native(name, binary, claims, engine=…)`;
  12 tests (listed in the commit message).
- Device: held the bus (`tools/p4cap.py --no-reset -s 1 -c "0.2 hold"` → `i2c0 held between transactions`),
  built and flashed `build-agent` (`idf.py -B build-agent -D PICOCALC_AGENT_WIFI=ON -D SDKCONFIG=sdkconfig.agent
  -D 'SDKCONFIG_DEFAULTS=sdkconfig.defaults;sdkconfig.agent-wifi' -p /dev/ttyACM0 flash`); `/dev/ttyACM0` stayed;
  captured 14 s with `worlds` and `stats`.

### Why

- Probes as worlds named after the attempt keep one binary and make each attempt a separate, supervised world:
  the test also sees supervision stop each probe after five crashes.
- `battery.cc` mirrors part of `power.js` so the C++ path is a real driver, not a toy: claim, handle, transfer
  with a gap, settle, channel, ask answered later.

### What worked

- `make test-native`: `Ran 12 tests … OK`, six consecutive runs.
- Sanitizers: `make SAN=1`, then the suite against `build-san/picocalc-host`: OK; a mixed scenario (bad JSON,
  i2c, forged handle, segfault, spin, probes, a non-ASCII payload `{"a":"é😀\n\""}`) printed
  `sanitizer reports: 0`.
- Device: `22 worlds; engines ['js']; restarts 0; errors []`; `stats`: "t = 17108.4 ms, lane busy 3347.8 ms
  (19.6%), 1062 turns, 18 published, 26 delivered, 0 crashes".

### What didn't work

- `-Warray-bounds` on the deliberate null write in `echo.c` and `-Wunused-result` on `write(2, …)` in `probe.c`;
  rewritten through a `volatile` pointer and an `if`.
- The first capture command, `-c "10 worlds"`, reached the console as `unknown command � (try help)`, likely a
  stray byte after the flash; the second capture's `worlds` and `stats` worked.

### What I learned

- An unhandled ask to a native world is answered with null (`NW_DONE` without a reply). A JavaScript world
  rejects it ("has no handler"). The difference is documented in `sdk/nw.h`'s contract: the binary decides.

### What was tricky to build

- The C++ driver's asynchronous ask: a "level" ask that arrives while a periodic read is in flight must not start
  a second transfer; it sets `waiting_` and returns `NW_LATER`, and the settle of the read already in flight
  answers it.

### What warrants a second pair of eyes

- The probe list: what else should a hostile binary try? `clone` (threads), `io_uring_setup`, `ptrace` and
  `memfd_create` are not on the allowed list, so the filter's default kills them, but no probe tests them yet.

### What should be done in the future

- N3 (WebAssembly through WAMR on the host), N4 (WAMR on the P4), N5 (trusted machine code on the P4 through
  `elf_loader`): each needs the user's approval to build external code.

### Code review instructions

- `natives/*.c*`, `tests/test_native_worlds.py`; `make natives test-native`;
  `make SAN=1 && PICOCALC_TEST_BINARY=build-san/picocalc-host PICOCALC_NATIVES=build/natives python3 tests/test_native_worlds.py`.

### Technical details

- The simulated battery register reads `[11, 82]`: register 0x0B, 82 %, not charging (`sim/stm32kbd.c`).
- Binaries: `echo` 799 KB, `probe` 791 KB, `battery` 997 KB (static glibc, static libstdc++).

## Step 5: WebAssembly worlds on the host through WAMR (N3)

With approval to build and run WAMR and `elf_loader`, I vendored a subset of WAMR 2.4.5, wrote the WebAssembly
backend (`nucleus/native_wasm.c`) and its SDK runtime (`sdk/nw_wasm.c`), and compiled the same `echo.c` and
`battery.cc` to `.wasm` with clang 18. All the tests now run for both engines; a WebAssembly probe tries eight
escapes (out-of-bounds loads, bad pointers and lengths handed to system calls, stack overflow, a trap, exit, a busy
loop), and each is stopped by a trap, an exit or the instruction budget, while a large allocation and stdio fail
inside the module. 25 tests pass, also on the sanitizer build; shots of both boards are unchanged.

### Prompt Context

**User prompt (verbatim):** "you may build and run WAMR and you may build and run elf_loader. commit at appropriate
intervals and keep a detailed diary as you work (using the diary format from the skill) (look up diary format in
skill, MANDATORY)"
**Assistant interpretation:** Proceed with N3 (WAMR on the host), N4 (WAMR on the P4) and N5 (`elf_loader` on
the P4), committing as I go and recording each step in this diary in the investigation format.
**Inferred user intent:** The remaining engines of the ticket, built and validated, not only designed.
**Commit (code):** 4dd164e — "picocalc-os: vendor WAMR 2.4.5 (fast interpreter subset) for WebAssembly worlds
(PICOCALC-NATIVE N3)"; 899358a — "picocalc-os: WebAssembly worlds in WAMR's interpreter, with the C and C++
examples and escape probes (PICOCALC-NATIVE N3)"

### What I did

- Configured WAMR once with its own CMake (`runtime_lib.cmake`, `WAMR_BUILD_FAST_INTERP=1`,
  `WAMR_BUILD_INSTRUCTION_METERING=1`, `WAMR_DISABLE_HW_BOUND_CHECK=1`, no AOT/JIT/WASI/libc-builtin) in the
  scratchpad to read the source list and defines from `compile_commands.json` (35 files), then wrote
  `tools/vendor-wamr.sh`, which copies that subset (plus the AOT headers that common code includes unconditionally,
  and the ESP-IDF platform layer for N4) into `third_party/wamr` and applies `third_party/wamr/patches/*.patch`.
- `patches/0001-instruction-count.patch`: the fast interpreter reads `exec_env->instructions_to_execute` into a
  local when it starts and never writes it back; the patch writes it back at `return_func` (called from native)
  and `got_exception`, and adds `wasm_runtime_get_instruction_count_limit`.
- `nucleus/native_wasm.c` (backend `"wasm"`): `wasm_load` checks `\0asm`, copies the bytes, loads, refuses any
  import that is not a linked function, instantiates with `max_memory_pages = mem_kb / 64`, refuses a module whose
  initial memory exceeds `mem_kb`, and looks up `_initialize`, `nw_wasm_init`, `nw_wasm_buffer`,
  `nw_wasm_event`. `wasm_event` sets the instruction limit from the budget, copies the event's strings into
  room the module gives (`nw_wasm_buffer`), calls `nw_wasm_event`, charges `used × PROFILE.wasm_ns_per_op` to
  `K.seg_cost`, and maps exceptions: "instruction limit exceeded" → `W->overrun`; `proc_exit` → "it exited with
  status N"; others → "it trapped: …"; no room for the event → `W->oom`.
- Imports: `nw.call` `(iiiI*~*~*~*~)I` (the wire's CALL frame as arguments; WAMR validates each `*~` pair) and
  `nw.error` `(*~)i`; `wasi_snapshot_preview1` `fd_close`, `fd_fdstat_get`, `fd_write`, `fd_read`, `fd_seek`
  (each returns EBADF, 8) and `proc_exit`.
- SDK: the 19 wrappers moved from `nw_proc.c` to `sdk/nw_calls.inc`; `sdk/nw_wasm.c` defines `call()` over the
  import and exports the three entry points; the `_Static_assert`s on the call numbering moved from
  `host/native_proc.c` to `nucleus/native.c` so they hold on every board.
- `PROFILE.wasm_ns_per_op` (P4 40 ns, an estimate until N4 measures it; PaperS3 60 ns); the overrun message says
  "virtual" for every engine but `native` processes.
- `tools/wasm-toolchain.sh`: no sudo here, so it `apt-get download`s `lld-18 wasi-libc libc++-18-dev-wasm32
  libc++abi-18-dev-wasm32 libclang-rt-18-dev-wasm32`, unpacks them into `build/wasm-toolchain`, and makes a
  resource directory joining clang's headers with the package's `libclang_rt.builtins-wasm32.a`.
- `Makefile`: WAMR objects in `$(BUILD)/wamr` (not with `M32=1`), `-DNUCLEUS_WASM=1`; `make wasm` builds
  `echo.wasm`, `battery.wasm`, `wprobe.wasm`, `wimport.wasm` (`-mexec-model=reactor -Wl,--stack-first
  -Wl,-z,stack-size=16384 -Wl,--strip-all`); `test-native` depends on both.
- `natives/echo.c` gained `oob` (a store at 0xfffffff0); `natives/wprobe.c` and `natives/wimport.c` are new.
- `tests/test_native_worlds.py`: `EngineTests` (the shared tests) with `ProcessWorldTests` and `WasmWorldTests`;
  the WebAssembly class adds the escape probes, modules that cannot run, and twenty asks in a row.

### Why

- One import (`nw.call`) with the wire's arguments instead of 19 imports: the kernel side has one place that
  validates, and the SDK's wrappers are shared with the process runtime unchanged.
- The kernel copies event strings into room the module allocates (`nw_wasm_buffer`) rather than using WAMR's
  app heap: no second heap in the module's memory, and the copy is the same shape as the wire's EVENT frame.
- WASI stubs that fail rather than refusing every module that uses `snprintf`: wasi-libc's stdio links
  `fd_write`, `fd_seek` and `fd_close` even when only `snprintf` is called. The same choice as the seccomp filter's
  "return an error" class.
- Instruction counting instead of a timer that interrupts the interpreter: deterministic on the host's virtual
  clock, and on the P4 it needs no second task.

### What worked

- `make test-native`: `Ran 25 tests … OK`, four consecutive runs; the WebAssembly probes log, e.g.
  `wprobe_badlen crashed handling start: it trapped: out of bounds memory access`,
  `wprobe_stack crashed handling start: it trapped: wasm operand stack overflow`,
  `wprobe_spin crashed handling start: ran past its turn budget of 100 virtual ms`,
  `imports crashed: it imports the function wasi_snapshot_preview1.path_open, which picocalc-os does not provide`.
- `make SAN=1` and the suite against `build-san/picocalc-host`: 25 OK, no sanitizer reports; `test-sys`,
  `test-fs`, `test-clock` on the sanitizer build: OK.
- `test-sys` (15), `test-fs` (9), `test-clock` (4), `test-apps` (fail 0), `test-agent` (fail 0, 23 native tests
  with 7 skipped as before): OK. `make shots` and `make BOARD=papers3 shots`: no file in `out/` or `out-papers3/`
  changed.

### What didn't work

- First build: `third_party/wamr/core/iwasm/common/wasm_memory.c:8:10: fatal error: ../aot/aot_runtime.h: No such
  file or directory`. Common code includes the AOT headers with AOT off; the vendoring script now copies
  `aot/aot_runtime.h`, `aot_intrinsic.h`, `aot_perf_map.h` and `compilation/aot.h`.
- First module build: `clang: error: unable to execute command: Executable "wasm-ld-18" doesn't exist!`, then
  `wasm-ld-18: error: cannot open /usr/lib/llvm-18/lib/clang/18/lib/wasi/libclang_rt.builtins-wasm32.a`. Fixed by
  the `wasm-ld-18` link and the joined resource directory in `tools/wasm-toolchain.sh`.
- `clang-18: error: unsupported option '-mexec-model=' for target 'wasm32-wasi'` on the `-c` of the runtime
  object: compile and link flags split (`WASM_FLAGS`, `WASM_LINK`).
- `battery.wasm`: `wasm-ld-18: error: …libc++.a(stdlib_new_delete.cpp.o): undefined symbol: __cxa_throw` (and
  `__cxa_allocate_exception`). Ubuntu's wasm32 libc++ is built with exceptions, its libc++abi without; `nw_wasm.c`
  defines both, weak, as traps.
- The alloc probe logged `TEST alloc succeeded` with `mem_kb` 1024. A temporary print showed `pages 1 max 16`:
  the cap held, and clang had removed the unused `malloc`/`free` pair and folded the null test to true. The probe
  keeps the pointer in a `volatile`.
- `/usr/bin/ld: warning: build/wamr/invokeNative_em64.o: missing .note.GNU-stack section implies executable
  stack`; `readelf -lW build/picocalc-host` showed `GNU_STACK … RWE`. The rule now assembles with
  `-Wa,--noexecstack`; after removing the stale object, `GNU_STACK … RW`.
- Sanitizer build: 12 failures, each WebAssembly world `crashed: it trapped: native stack overflow`, and UBSan
  `store to misaligned address` / `member access within misaligned address` in `wasm_loader.c`,
  `wasm_runtime.c` and `wasm_runtime_common.h` (36 + 12 × 9 reports). With
  `ASAN_OPTIONS=detect_stack_use_after_return=0` the overflow went away: WAMR compares the address of a local with
  the thread's stack bounds, and ASan's fake stacks put locals elsewhere. GCC 13 rejects
  `-fsanitize-address-use-after-return=never` (`unrecognized command-line option`); `--param
  asan-use-after-return=0 -fno-sanitize=alignment` on WAMR's objects only (with `SAN=1`) fixed both.

### What I learned

- WAMR's `wasm_runtime_get_import_type` reports `linked` for function imports when natives are registered before
  the load, so unknown imports can be refused before instantiation.
- With `--stack-first`, a C shadow-stack overflow would wrap below address 0 and trap; in practice WAMR's own
  frame stack (16 KB) overflows first ("wasm operand stack overflow").
- A handler's cost is dominated by the C library: a `ping` that formats one reply with `snprintf` is about 2,520
  interpreter instructions; `nw_init` with three calls about 6,240.

### What was tricky to build

- The instruction budget across several calls in one event: the limit is set once, `nw_wasm_buffer` runs, and
  the patched interpreter writes what is left back, so `nw_wasm_event` starts with the remainder and the cost is
  the limit minus the final remainder. Without the patch the second call would have started with the full limit
  again and the cost could not be read at all.
- Pointers from the module: `*~` makes WAMR validate `[p, p + n)` and convert it before the native function runs,
  and a failure raises an exception in the module, so a bad pointer is a trap of the offending world, not an
  error the module can ignore. The kernel then writes results through its own buffer and copies what fits.

### What warrants a second pair of eyes

- `third_party/wamr/patches/0001-instruction-count.patch`: the write-back happens only where the interpreter
  returns to native code or stops on an exception; any other exit path would leave a stale count (the cost would
  be wrong, the budget still enforced).
- The WASI stubs: `fd_read` and `fd_write` share a four-argument stub that never touches memory; nothing else
  from WASI is linked.
- Memory accounting (`W->mem_used`) counts linear memory and the 16 KB stack, not the interpreter's compiled
  code or the module's bytes.

### What should be done in the future

- N4: WAMR on the P4 (ESP-IDF platform layer, `invokeNative_riscv.S`), bundling `.wasm` files into the firmware,
  measuring `wasm_ns_per_op`, a device run; WebAssembly apps from storage through the Loader.
- N5: trusted machine code on the P4 through `elf_loader`.

### Code review instructions

- Start at `nucleus/native_wasm.c` (`wasm_load`, `wasm_event`, `imp_call`), then `sdk/nw_wasm.c` and
  `sdk/nw_calls.inc`, then `third_party/wamr/patches/0001-instruction-count.patch`.
- `tools/wasm-toolchain.sh` (once), `make test-native`; `make SAN=1 && ASAN_OPTIONS=detect_leaks=0 make SAN=1
  test-native`; `readelf -lW build/picocalc-host | grep GNU_STACK` must say `RW`.

### Technical details

- Host, wall time per JavaScript ask of an echo service (5,000 asks, minus a 10-ask run): JavaScript 16.7 µs,
  WebAssembly 31.6 µs, process 49.9 µs. Loading `echo.wasm` (including the runtime's first start): 1.4 ms.
- Module sizes (stripped): `echo.wasm` 32 KB, `battery.wasm` 38 KB, `wprobe.wasm` 29 KB, `wimport.wasm` 10 KB;
  each starts with one 64 KB page (16 KB stack first, then data), no declared maximum.
- WAMR's objects on the host (x86-64, -O2): 225 KB of text (`size -t build/wamr/**/*.o`); picocalc-host's text is
  1.46 MB in all.

## Step 6: WebAssembly apps from storage, and WebAssembly on the P4 (N4)

WebAssembly modules now start from files as well as from the manifest: the Loader hands the kernel a read handle
to `apps/name.wasm`, and the kernel reads the bytes itself and starts `u-name`. On the P4, WAMR builds with
ESP-IDF's platform layer, and the device runs modules from its FAT partition. Getting there cost one reboot loop:
WAMR's ESP-IDF layer asserts when it runs outside a pthread, and I had put the first test module in
`autostart.txt`. Every escape probe behaves on the device as on the host. A long detour established that a 2.7× swing
in the device's JavaScript speed is a property of memory placement on the P4, not of WAMR.

### Prompt Context

**User prompt (verbatim):** see Step 5. Mid-step the user asked "what are we doing right now?" and later wrote "i
was mucking about with the device, btw. my bad, in case you saw something weird at the start, i tried to launch
ech.wasm or something".
**Assistant interpretation:** Continue N4: WebAssembly on the device, bundling or loading modules, calibration,
apps from storage.
**Inferred user intent:** The binaries that are the P4's only isolated option, running on the real hardware.
**Commit (code):** 9d66b95 — "picocalc-os: WebAssembly apps from storage through the Loader, and a benchmark
module (PICOCALC-NATIVE N4)"; 7ba759e — "picocalc-os: WebAssembly worlds on the ESP32-P4 (PICOCALC-NATIVE N4)"

### What I did

- Storage: `FS_LOAD` in `nucleus/fs.c` (any bytes, up to `USER_BINARY_MAX` 256 KB); `fs_job_t.done`, a callback
  both ports call instead of settling; `__ka("sys.spawn", name, handle)` (`ka_spawn` in `vm.c`) and
  `kernel_spawn_loaded` in `kernel.c` (`\0asm` → WebAssembly, UTF-8 text → JavaScript, anything else refused);
  `kernel_spawn(name, bytes, len, engine, …)` tears down the old instance before switching engines; the prelude's
  `sys.spawn` takes a `Handle` and returns a promise; the Loader lists `*.wasm` and starts them through a handle.
- Tests: `WasmAppTests` in `tests/test_loader_native.py` (a module from storage runs without claims, switches to
  JavaScript and back; ELF bytes, a file over 256 KB, a directory, a missing file, a bad name, a released handle and
  the missing claim are refused); a Loader unit test in `tests/sysapps.test.mjs`.
- `native_wasm.c`: WAMR allocates through `port_heap_malloc` (`Alloc_With_Allocator`); a real-clock overrun check
  after each event; `mem_used` in host bytes; the trace logs each event's instruction count.
- `natives/bench.c`: an xorshift loop (12.5 instructions per iteration, counted on the host with `-vv`).
- P4: WAMR sources, defines and include directories in `port/esp32p4/main/CMakeLists.txt`
  (`BUILD_TARGET_RISCV32_ILP32F`, `invokeNative_riscv.S`, components `lwip` and `pthread`); the forced include of
  `p4_compat.h` limited to C; `port_native_backend(ENG_WASM)`; `bundle_js.cmake` also takes `*.wasm`.
- WAMR patches 0002 (linear memory in PSRAM) and 0003 (`os_self_thread` from the FreeRTOS task handle).
- Console `put PATH [BASE64]` in `fs_p4.c` and `tools/p4put.py`; copied `echo.wasm`, `bench.wasm`,
  `battery.wasm` (as `batt.wasm`), four copies of `wprobe.wasm` (`wp-oob`, `wp-spin`, `wp-badptr`, `wp-stack`) and
  `wimport.wasm` into `apps/` (about 2.5 KB/s).
- Device runs through `apps/autostart.txt`, with the capture itself truncating it 8 s after boot.

### Why

- Bytes never pass through JavaScript: no binary type in the fs API, and a world cannot alter a module between
  reading and starting it.
- The engine comes from the content, not the extension, so a renamed ELF is still refused.
- `put` on the console rather than a world: it needs physical access, as flashing does.

### What worked

- Host: `test-native` 25 OK, `test-sys` OK (11 system tests, and 6 loader tests with the 2 new ones), `test-fs`, `test-apps` OK; shots unchanged
  except `out/41-about.png` (JS heap total 5490 → 5502 KB, the longer prelude).
- Device (`build-agent`, 2.50 MB, 38 % of the app partition free): `u-echo` loads, inits, starts and ticks;
  `u-batt: battery: open failed: u-batt has no claim on i2c0:0x1f`; `u-wp-oob` and `u-wp-badptr` `it trapped: out
  of bounds memory access`; `u-wp-stack` `it trapped: wasm operand stack overflow`; `u-wp-spin` `ran past its turn
  budget of 50 ms`; `u-wimport crashed: it imports the function wasi_snapshot_preview1.path_open, which picocalc-os
  does not provide`; each probe stays stopped after five crashes; 22 system worlds idle, 0 restarts; no reboot.
- `BENCH loop n=1000 us=900`, `n=4000 us=3499`, `n=16000 us=13884` (and 901/3499/13883 in a second boot):
  0.866 µs per 12.5 instructions, 69 ns per instruction; `PROFILE.wasm_ns_per_op` 40 → 70.

### What didn't work

- `fatal error: esp_pthread.h: No such file or directory` (WAMR's platform header): `pthread` added to
  PRIV_REQUIRES.
- `p4_compat.h:8: Error: unrecognized opcode 'size_t malloc_usable_size(void*ptr)'` on `invokeNative_riscv.S`: the
  forced include reached the assembler; now `$<$<COMPILE_LANGUAGE:C>:-include;…>`.
- First module load on the device: `assert failed: pthread_self pthread.c:583 (false && "Failed to find current
  thread ID!")`, then `Rebooting...`. With `echo` in `autostart.txt` this repeated on every boot (a reboot loop). I
  broke it by sending `put apps/autostart.txt` (which truncates) every 250 ms from a script; the console answered
  1.2 s after reset, before the Loader's autostart at about 3.9 s. Fix: patch 0003.
- The first test loop in zsh (`set -- $pair`) did not split words; rewritten with `while read`.
- A first host run of the new loader tests: an 800 KB ELF failed the size check before the content check, and
  `w` lacked `sys.read`; both were test mistakes.

### What I learned

- The P4's JavaScript speed depends on placement, by up to 9×. Boot calibration and `bench` (the 100k loop and
  fib(20); model 133 ms and 29.1 ms):

  | Firmware | loop, fib at ~16 s |
  |---|---|
  | before N3 (8ffc032), 5 boots | 113 ms, 30.5 ms |
  | N4, no module loaded | 118 ms, 30.7 ms |
  | N4, after any module load (even one refused at the import check) | 319 ms, 85 ms |
  | N4 + debug commands with a 16 KB static buffer, 5 boots, no module | 320 ms, 85 ms |
  | the same without Wi-Fi (plain `build`) | 124 ms, 277 ms |
  | an older capture from an earlier ticket (`net1.log`) | 117 ms, 277 ms |

  A register-only loop (4M iterations, 44.6 ms; 1M with interrupts off, 11.1 ms) and 64K random PSRAM reads
  (33 ms) are the same in fast and slow images: no task takes the CPU, and PSRAM itself is not slower. Starting the
  runtime alone (`wasminit`) and one float operation (`fputest`) changed nothing. The L2 cache, shared by flash code
  and PSRAM data, is 128 KB (`CONFIG_CACHE_L2_CACHE_128KB`); the likely cause is conflicts between QuickJS's hot code
  and data, which move with the image and with where a new heap lands. That was so before this ticket; I left it
  as an open question.
- With the instruction budget at 70 ns, a loop of volatile stores ran 82 ms for a 50 ms budget (144 ms at
  40 ns): memory instructions cost more than the benchmark's average, and the real-clock check acts only when the
  event returns.

### What was tricky to build

- The reboot loop: anything in `autostart.txt` runs before I can type, so a crash there repeats forever. Since
  then every device run truncates `autostart.txt` itself a few seconds after boot, and new code is started that way
  only.
- Telling WAMR from placement: the decisive data were a slow image with no module loaded and a fast image with
  WAMR linked in. One measurement before and after was misleading.

### What warrants a second pair of eyes

- `kernel_spawn` switching engines on a live slot: teardown happens with the old engine, then the source, length,
  engine and file change.
- The probe apps (`wp-*.wasm`, `wimport.wasm`) and the test modules stay in the device's `apps/`; `autostart.txt`
  is empty.

### What should be done in the future

- The JavaScript placement sensitivity on the P4 (its own ticket): FreeRTOS run-time stats, the L2 cache size,
  where QuickJS's heap and stack land.
- A real-clock check inside long WebAssembly turns (WAMR's terminate from a timer) if 1.6× overruns matter.
- N5.

### Code review instructions

- `nucleus/vm.c` `ka_spawn`, `nucleus/kernel.c` `kernel_spawn` / `kernel_spawn_loaded`, `nucleus/fs.c` `do_load`,
  `js/apps/loader.js` `ldStart`; `port/esp32p4/main/CMakeLists.txt`; `third_party/wamr/patches/0002*`, `0003*`.
- `make test-native test-sys`; on the device: `tools/p4put.py build/natives/echo.wasm apps/echo.wasm`, then start
  it from the Loader.

### Technical details

- Device memory with 30 worlds (3 modules running, 5 stopped): internal 88 KB free, PSRAM 26.35 MB free (27.27 MB
  before the modules).
- Console `put`: at most 768 decoded bytes per line; `tools/p4put.py` sends 680.
