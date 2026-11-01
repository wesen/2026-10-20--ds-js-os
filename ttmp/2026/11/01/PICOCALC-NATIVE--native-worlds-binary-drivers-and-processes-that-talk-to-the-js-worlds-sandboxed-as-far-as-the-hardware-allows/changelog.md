# Changelog

## 2026-11-01

- Initial workspace created

## 2026-11-01 - N1 and N2: native worlds on the host

Engines per world (eng_*), nucleus/native.c system calls with strict payloads, the host process backend under seccomp (4b3ce2f); examples in C and C++ and 12 tests incl. sandbox probes (199694d). P4 flashed: JS worlds unchanged. N3-N5 wait for approval to build WAMR / elf_loader.

### Related Files

- /home/manuel/code/wesen/2026-10-20--ds-js-os/picocalc-os/host/native_proc.c — host backend: process, rlimits, seccomp filter, turns over the socket
- /home/manuel/code/wesen/2026-10-20--ds-js-os/picocalc-os/nucleus/native.c — kernel side: events, system calls, payload validation
