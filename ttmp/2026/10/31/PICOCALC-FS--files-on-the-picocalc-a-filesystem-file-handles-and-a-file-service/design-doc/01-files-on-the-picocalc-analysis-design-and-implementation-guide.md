---
Title: 'Files on the PicoCalc: analysis, design and implementation guide'
Ticket: PICOCALC-FS
Status: active
Topics:
    - picocalc
    - esp32-p4
    - filesystem
    - handles
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/nucleus/fs.c
      Note: POSIX file layer and path rules
    - Path: repo://picocalc-os/nucleus/vm.c
      Note: hw.fs, fs.at, ka_fs
    - Path: repo://picocalc-os/port/esp32p4/main/bus_p4.c
      Note: i2c hold before resets
    - Path: repo://picocalc-os/port/esp32p4/main/fs_p4.c
      Note: FAT mount, worker, console
    - Path: repo://picocalc-os/tests/test_fs_native.py
      Note: native tests
ExternalSources: []
Summary: 'Why picocalc-os needs files, how they fit its handle and deferred-effect model, and the implementation: a POSIX file layer shared by the host and a FAT partition on the ESP32-P4''s flash, file handles that can be narrowed to one directory or one file, and asynchronous operations on a worker task.'
LastUpdated: 2026-10-31T23:00:00-04:00
WhatFor: Onboarding to the filesystem layer, and the plan PICOCALC-FS follows.
WhenToUse: Before writing an app that reads or writes files, or changing nucleus/fs.c, the H_FS handle, or the P4 file worker.
---

# Files on the PicoCalc: analysis, design and implementation guide

This guide adds files to picocalc-os. Until now the only thing a program could keep across a reboot was one
small JSON record per world (the *store*, at most 16 KB by default). That is enough for settings and a
session, but not for a text editor, a file browser, a todo list or programs loaded from storage, which
are the next four tickets. They all need the same thing underneath: named files and directories, a
safe way for one program to give another access to one file, and storage that survives power loss.

The guide assumes you know nothing about the system. Section 2 explains the parts of picocalc-os that the
design depends on; section 3 the storage options on this hardware; sections 4 to 7 the design; section 8
the implementation plan; section 9 the tests.

## 1. What this ticket delivers

- A **file layer** in the nucleus (`nucleus/fs.c`): list, stat, read, write, append, mkdir, remove, rename
  and free space, on paths under one root directory, written once against POSIX calls.
- **Roots.** On Linux, a directory given with `-f DIR`. On the PicoCalc's ESP32-P4, a FAT filesystem in a new
  11.8 MB flash partition, mounted at `/files`. (The SD card slot comes later; section 3.)
- **File handles** (`H_FS`): a world gets a handle to a directory from a manifest claim such as `fs:/notes`;
  it can narrow it to a subdirectory or to one file, with fewer rights, and hand that to another world.
- **Asynchronous operations.** Every file operation returns a promise and is carried out after the segment
  that asked for it ends cleanly. On the device the work runs on a dedicated worker task, so a flash erase
  never stalls the keyboard or the screen.
- **Console tools** on the device: `ls PATH` and `cat PATH`, for looking at the filesystem without a program.

## 2. The parts of picocalc-os this builds on

### 2.1 Worlds and the lane

picocalc-os runs many JavaScript programs called **worlds**. Each is a separate QuickJS virtual machine with
its own heap and time budget, created from a file listed in `js/system.json`. Worlds share no memory; they
exchange JSON messages with `send`, `ask` (a message that returns a promise for the reply) and `publish`.

One **lane** runs one world at a time. A **turn** is one message handled to completion; an `async` handler's
turn is cut into **segments** at each `await`. The kernel (`nucleus/kernel.c`) charges each segment to the
world's budget and stops a world that overruns.

### 2.2 Deferred effects

Everything a segment does to the outside world is recorded as a **deferred effect** (`deferred_t`) and
applied when the segment ends; if the segment throws, its effects are thrown away with it. This is what makes
a crash harmless: half an operation never happens. File writes must follow the same rule, or a world that
crashes in the middle of saving could leave a file half-written by its own logic.

```text
segment:   f.write("a.txt", text)   ...   throw new Error()       -> nothing is written
segment:   f.write("a.txt", text)   ...   return                   -> the write is applied after the return
```

### 2.3 Handles and claims

A **handle** is a small integer that stands for a piece of hardware: an I2C device, the SPI bus, a
framebuffer. The kernel keeps the table (`K.handles` in `nucleus/hw.c`) and checks every use:

```c
typedef struct {
  int id, type, rights, parent, minter;   // rights: R_READ | R_WRITE | R_GRANT
  uint64_t holders;                       // one bit per world that holds it
  bool live, revoked;
  char claim[NAME_LEN];
  int bus, addr, hz; int buf; ...
} handle_t;
```

- A world gets a first handle by naming a **claim** that its manifest entry lists, for example
  `hw.i2c("i2c0:0x1f")` in the keyboard driver, whose manifest says `"claims": ["i2c0:0x1f"]`.
- `h.narrow("r")` (`h.attenuate` in C) makes a **child** handle with fewer rights. The world that made the
  child is its **minter** and can `revoke()` it at any time; every use checks the whole parent chain.
- A handle **travels in a message**. The prelude encodes it as `{"$h": id}`, the kernel checks that the
  sender may pass it on (it has `R_GRANT`, or it is the minter), and the receiver is added to `holders`.

That is exactly the shape needed for "the file browser opens a file in the editor": the browser holds a
handle to the whole filesystem, narrows it to one file with read and write rights, and sends it. The editor
holds no file claim of its own; it can touch that one file and nothing else, and the browser can take the
access back.

### 2.4 Asynchronous kernel operations

Bus transfers already work the way file operations should. In `nucleus/vm.c`, `host_ka()` handles the JS
call `__ka("i2c", ...)`: it creates a promise (`vm_new_promise`), records a deferred effect that will start
the transfer when the segment ends, and returns the promise. The port carries the transfer out (on the P4,
a FreeRTOS worker task per bus) and the kernel task settles the promise with `kernel_settle_at()`:

```text
JS: await dev.read(4, 1)
 -> host_ka("i2c") -> vm_new_promise -> hw_i2c(): defer(start transfer)
 -> segment ends -> deferred effect runs -> bus_run_i2c(): queue to the i2c worker task
 -> worker: i2c_master_transmit/receive -> post result to p4_kq
 -> kernel task: bus_p4_done() -> kernel_settle_at(world, epoch, promise, ok, json)
 -> JS continues after the await
```

The **epoch** in that call matters: a world that crashed and restarted has a new epoch, so a result meant
for its previous life is dropped instead of settling a promise that no longer exists.

### 2.5 The existing store

`store.get/set/remove/all` (prelude) and `op_store_load/op_store_save` (`nucleus/vm.c`) keep one JSON record
per world. It is quota-bound and private, and writes are deferred effects. Files do not replace it: settings
and session state stay in the store, documents go in files.

## 3. Where files can live on this hardware

| Option | Status | Notes |
|---|---|---|
| PicoCalc's SD slot (on the mainboard, wired to the Pico socket's SPI0 pins GP16–19, card detect GP22) | not usable yet | The P4 sits on a same-position adapter; only the keyboard and LCD pins have been verified (`esp32-s3-m5/0099`). The SD pins' P4 GPIOs are unknown. |
| The Waveshare board's own microSD slot (SDMMC) | unknown | Probably not reachable inside the case; card presence unknown. |
| The P4's flash | **chosen** | 32 MB chip, of which ESP-IDF can address 16 MB ("Detected flash size > 16 MB, but access beyond 16 MB is not supported"). The app and stores end at 0x430000, leaving 11.8 MB. |

The flash partition works today, needs no hardware investigation, and survives power loss through ESP-IDF's
wear-levelling layer. The design keeps the storage behind one root path, so an SD card can later be mounted
as a second root (for example `sd:/`) without changing the API.

New partition table (`port/esp32p4/partitions.csv`):

```text
nvs         0x9000    24 KB   credentials (agentcfg) and Wi-Fi
phy_init    0xf000     4 KB
factory     0x10000    4 MB   application
agentstore  0x410000 128 KB   world records (store)
files       0x430000 0xBD0000 FAT with wear levelling, mounted at /files   (new: 11.8 MB, ends at 16 MB)
```

FAT on ESP-IDF needs long file names enabled (`CONFIG_FATFS_LFN_HEAP=y`) or names are limited to 8.3.
FAT is case-insensitive; the host's Linux directory is not. The nucleus therefore compares names as given and
apps should not rely on two names that differ only in case.

## 4. Design: paths, roots and the POSIX layer

### 4.1 Paths

A path inside picocalc-os is a relative, `/`-separated string such as `notes/todo.txt`. The nucleus checks
every path before it reaches the port (`fs_path_ok()`):

- at most 95 bytes (`FS_PATH_MAX` 96 with the terminator);
- segments of letters, digits, space, `.`, `_` and `-`; no empty segment, no `.` or `..` segment;
- no segment starting with `.` (names starting with a dot are reserved for the layer's temporary files);
- no leading `/`; the empty path means the handle's own directory or file.

A handle stores its own path relative to the root. An operation's path is joined to it:

```text
handle path "notes"      + op path "todo.txt"   -> "notes/todo.txt"
handle path "notes/a.txt" (a file handle) + ""  -> "notes/a.txt"     (a file handle takes only "")
```

Because `..` is rejected, no join can climb out of a handle's directory.

### 4.2 The POSIX layer (`nucleus/fs.c`)

Both roots support the POSIX calls `opendir`, `readdir`, `stat`, `fopen`, `fread`, `fwrite`, `fsync`,
`rename`, `unlink`, `mkdir`, `rmdir` (on the P4 through ESP-IDF's VFS). So the file layer is written once:

```c
// nucleus/fs.c: everything below takes a validated relative path and the port's root.
typedef struct {
  int op;                    // FS_LIST, FS_STAT, FS_READ, FS_WRITE, FS_APPEND, FS_MKDIR, FS_REMOVE, FS_RENAME, FS_INFO
  char path[FS_PATH_MAX], path2[FS_PATH_MAX];
  char *data; size_t len;    // FS_WRITE / FS_APPEND input
  int ok; char *json;        // result: a JSON value, or an error message as a JSON string
} fs_job_t;
void fs_execute(fs_job_t *j);   // runs the job against port_fs_root(); fills ok and json
```

Results are JSON so the kernel can settle a promise with them directly:

| Operation | JS call | Result |
|---|---|---|
| list | `await d.list(path)` | `[{"name":"a.txt","dir":false,"size":12}, ...]`, sorted by name |
| stat | `await d.stat(path)` | `{"dir":false,"size":12}`, or rejects "no such file" |
| read | `await d.read(path)` | the file as a string (UTF-8 checked, at most 64 KB) |
| write | `await d.write(path, text)` | `{"bytes":N}`; replaces the file |
| append | `await d.append(path, text)` | `{"bytes":N}` (the new size) |
| mkdir | `await d.mkdir(path)` | `true` |
| remove | `await d.remove(path)` | `true` (a file, or an empty directory) |
| rename | `await d.rename(from, to)` | `true` (both inside the handle) |
| info | `await d.info()` | `{"total":bytes,"free":bytes}` |

A write replaces the file through a temporary file in the same directory, so a power cut leaves either the
old file or the new one:

```text
write(path, data):
  tmp = dir(path) + "/.w-" + base(path)
  f = fopen(tmp, "wb"); fwrite(data); fflush; fsync; fclose
  if exists(path): unlink(path)          # FAT's rename does not replace an existing name
  rename(tmp, path)
```

On FAT the unlink-then-rename leaves a short window in which only the temporary file exists; the layer
recovers it on the next list or read of that directory (a `.w-` file whose target is missing is renamed into
place). On Linux `rename` replaces atomically and the window does not exist.

### 4.3 Text, not bytes

Files are read and written as JavaScript strings, encoded as UTF-8. A read checks that the bytes are valid
UTF-8 (the agent transport's validator, moved to `nucleus/util.c`) and rejects a file that is not text or is
larger than 64 KB. Binary files are out of scope until an app needs them.

## 5. Design: file handles

### 5.1 The handle

`handle_t` gains a path and a kind:

```c
enum { H_I2C, H_SPI, H_DMA, H_EPD, H_ADC, H_GPIO, H_FS };
typedef struct {
  ...
  char path[FS_PATH_MAX];   // H_FS: relative to the root; "" is the root
  bool file;                // H_FS: the handle names one file, not a directory
} handle_t;
```

A world gets a directory handle from a claim:

```json
{ "name": "files", "file": "apps/files.js", "claims": ["fs:/"] }
{ "name": "agent", "file": "system/agent.js", "claims": ["net.agent", "sys.read", "fs:/notes"] }
```

```js
const root = hw.fs("fs:/");        // a handle to the whole filesystem, rights rwg
const notes = hw.fs("fs:/notes");  // only if the manifest lists exactly this claim
```

`hw.fs(claim)` creates the directory if it does not exist, so a world can be given a private directory just by
listing it in the manifest.

### 5.2 Narrowing to a directory or one file

`d.at(path, rights)` makes a child handle for a path inside `d`, with rights that are a subset of `d`'s:

```js
const one = root.at("notes/todo.txt", "rw");   // one file, read and write; this world is its minter
send("editor", "open", { file: one });          // the editor now holds it
// later, if needed:
one.revoke();                                   // every use by the editor now fails
```

```text
           files world                              editor world
  root (fs:/, rwg) ──at("notes/todo.txt","rw")──>  one (file, rw)  ── read() / write() only on notes/todo.txt
                         minter = files              cannot pass it on (no g, not the minter)
                         one.revoke()  ─────────────>  every later use: "handle N was revoked"
```

The rules, all checked in C:

- `at` on a file handle is refused; a file handle's operations take only the empty path.
- `list`, `mkdir` and `rename` need a directory handle; `read` and `stat` need `r`; `write`, `append`,
  `mkdir`, `remove` and `rename` need `w`.
- A file handle cannot remove or rename the file it names (that changes what the handle names).

### 5.3 Why not one global file API with a claim per path?

A claim check alone would make every world that needs one file hold a claim to a directory, and every change
in who may open what would be a manifest edit. Handles let access follow the user's action: the user picks a
file in the browser, and only then does the editor get that file.

## 6. Design: asynchronous operations

Every file operation is an asynchronous kernel operation, `__ka("fs", handleId, op, path, path2, data)`:

```text
host_ka("fs"):
  h = use(handle, H_FS, right needed by op)                  # rights, revocation, holder checks
  path = join(h.path, arg) ; fs_path_ok(path) or reject
  promise = vm_new_promise()
  job = fs_job(op, path, ...) ; defer(run_fs, job, world, epoch, promise)
  return promise

run_fs (a deferred effect, after the segment ends cleanly):
  port_fs_submit(job, world, epoch, promise)

host port:  fs_execute(job) now; kernel_settle_at(world, epoch, promise, job.ok, job.json, at + cost)
P4 port:    queue job to the "fs" worker task -> fs_execute(job) -> post to p4_kq
            -> kernel task: kernel_settle_at(world, epoch, promise, job.ok, job.json, now)
```

Reads are asynchronous too. That keeps one model for every operation, and when the SD card arrives (where a
read can take tens of milliseconds) nothing changes.

On the host the cost is modelled in virtual time (2 ms plus 1 µs per byte), so screenshot scripts stay
deterministic.

## 7. Design: the PicoCalc pieces

### 7.1 The P4 port

```text
app_main:  p4_store_init()          # NVS
           p4_fs_init()             # new: esp_vfs_fat_spiflash_mount_rw_wl("/files", "files", format_if_mount_failed)
                                    #      and the "fs" worker task (core 0, priority 4)
port_fs_root()   -> "/files"         or NULL if the mount failed
port_fs_submit() -> xQueueSend(q_fs, job)
fs worker        -> fs_execute(job); kmsg{fs job} -> p4_kq
kernel task      -> p4_fs_done(): kernel_settle_at(...)
```

`kmsg_t` gains a pointer to the finished job, since a read result is larger than the 96-byte `json` field
bus results use.

### 7.2 The host port

`host/main_host.c` gains `-f DIR`; without it the root is `OUT_DIR/fs`. `make shots` copies `fs-seed/`
(sample files in the repository) to a fresh directory for each script, so captures do not depend on what an
earlier run wrote.

### 7.3 Console commands (P4)

```text
ls [PATH]     list a directory under /files
cat PATH      print a text file (first 4 KB)
df            total and free bytes
```

These run on the kernel task and read directly, which is acceptable for a debugging console.

### 7.4 What does not change

- The PaperS3 build (`js-papers3`, MicroQuickJS binding) gets no file operations in this ticket; its
  `port_fs_root()` returns NULL and `hw.fs` reports "no filesystem".
- The store keeps its role for small private state.

## 8. Implementation plan

| Step | Work | Check |
|---|---|---|
| F1 | `nucleus/fs.c` (POSIX layer, path rules, temp-file writes), UTF-8 validator to `util.c`, `H_FS` in `nucleus.h`/`hw.c` | host build |
| F2 | `vm.c`: `hw.fs`, `fs.at`, `__ka("fs")`, `run_fs`; prelude `hw.fs`, `Handle.list/read/write/...` | native tests |
| F3 | Host root (`-f`, default), virtual-time cost, `fs-seed/`, `make shots` copies the seed | `make shots` unchanged |
| F4 | P4: partition, FAT mount, worker task, `p4_fs_done`, console `ls`/`cat`/`df` | flash; `ls`, a world writes and reads a file, reboot keeps it |
| F5 | Tests: `tests/test_fs_native.py` (paths, rights, narrowing, revocation, crash discards a write, grant rules, big files, UTF-8) | `make test-fs` |

## 9. Tests

The native tests follow `tests/test_agent_native.py`: each test writes a tiny manifest and one or two worlds
into a temporary directory and runs the host binary on them. The properties worth a test each:

- A path with `..`, a leading `/`, an empty segment or a leading dot is rejected before any I/O.
- A world without the claim cannot get a handle; `fs:/notes` does not open `fs:/`.
- `at` narrows: a child with `r` cannot write; a file handle cannot list, rename or remove its file.
- A narrowed handle sent to another world works there; after `revoke()` it fails.
- A world that receives a handle without `g` cannot pass it on.
- A segment that writes and then throws leaves the file unchanged.
- A 64 KB file round-trips; 64 KB + 1 is refused; invalid UTF-8 is refused on read.
- A restarted world's old pending operation does not settle in its new life (epoch).

## 9a. As built and measured

- Host: `make test-fs` runs the nine tests of section 9; clean under ASan (with leak detection) and UBSan.
- Device: the `files` partition mounts at `/files` with 11,956 KB; the first mount (with format) took 773 ms,
  later mounts 3 ms. Commits `e16fa7d` (host side) and `6f12990` (device).
- The prelude's file methods cost about 4 KB of heap per world on the 64-bit host; `flaky`'s limit went from
  256 to 320 KB.
- **The keyboard controller and resets.** A reset of the P4 alone during a keyboard transaction can leave the
  STM32 not acknowledging its address until the PicoCalc is power-cycled (1 reset in 5 in a test). It is not a
  stuck SDA line, so an I2C bus recovery does not help. The console's `hold` stops the i2c worker between
  transactions; `reboot` holds and restarts; `tools/p4cap.py` sends `hold` before it resets the board (10 of 10
  resets clean). Before `idf.py flash`, send `hold` too: `tools/p4cap.py --no-reset -s 1 -c "0.2 hold"`.
- World-level file operations on the device are first exercised by the Files app in PICOCALC-EDIT.

## 10. API reference

### JavaScript (prelude)

```js
hw.fs(claim)                 // -> directory Handle, from a manifest claim "fs:/path"
h.at(path, rights)           // -> child Handle (directory or file), rights subset of "rwg"
h.list(path = "")            // -> Promise<[{name, dir, size}]>
h.stat(path = "")            // -> Promise<{dir, size}>
h.read(path = "")            // -> Promise<string>
h.write(path, text)          // -> Promise<{bytes}>   (file handles: h.write("", text))
h.append(path, text)         // -> Promise<{bytes}>
h.mkdir(path)                // -> Promise<true>
h.remove(path)               // -> Promise<true>
h.rename(from, to)           // -> Promise<true>
h.info()                     // -> Promise<{total, free}>
h.narrow(rights), h.revoke(), h.release()    // as for every handle
```

### C

```c
#define FS_PATH_MAX 96
#define FS_FILE_MAX 65536
bool fs_path_ok(const char *p);                      // nucleus/fs.c
void fs_execute(fs_job_t *j);                        // nucleus/fs.c
const char *port_fs_root(void);                      // ports: the root directory, or NULL
void port_fs_submit(fs_job_t *j, int w, int epoch, int promise);   // ports: run, then settle
bool utf8_valid(const unsigned char *s, size_t n);   // nucleus/util.c
```

## 11. File reference

| File | Role |
|---|---|
| `picocalc-os/nucleus/fs.c` | new: path rules, POSIX file layer |
| `picocalc-os/nucleus/nucleus.h` | `H_FS`, `handle_t.path/file`, `fs_job_t`, port contract |
| `picocalc-os/nucleus/hw.c` | handle names, `hw_handles_json` shows paths |
| `picocalc-os/nucleus/vm.c` | `hw.fs`, `fs.at`, `__ka("fs")`, `run_fs` |
| `picocalc-os/js/prelude.js` | `hw.fs`, file methods on `Handle` |
| `picocalc-os/host/main_host.c`, `host/port_host.c` | `-f`, the host root and submit |
| `picocalc-os/port/esp32p4/partitions.csv` | the `files` partition |
| `picocalc-os/port/esp32p4/main/fs_p4.c` | new: mount, worker, completion, console commands |
| `picocalc-os/fs-seed/` | new: sample files for scripts |
| `picocalc-os/tests/test_fs_native.py` | new: the tests in section 9 |
