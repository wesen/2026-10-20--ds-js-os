---
Title: "Trace REPL Commands, Flags and HTTP Protocol"
Slug: "trace-repl-cli-and-http"
Short: "The trace-repl subcommands and their flags, logging, service limits, exit statuses and every HTTP route of the session protocol."
Topics:
- trace-repl
- cli
- http
- api-reference
Commands:
- serve
- open
- eval
- job
- close
- sessions
- results
- info
Flags:
- addr
- archive
- device-study
- simd-study
- repo
- mount
- results
- max-job
- idle
- session
- code
- job
- job-timeout
- detach
- arg
- args-file
- job-id
- stop
- name
- log-level
- log-format
IsTopLevel: true
IsTemplate: false
ShowPerDefault: true
SectionType: GeneralTopic
---

`trace-repl` has one server command, `serve`, and seven client commands that speak its HTTP protocol. This page lists them with their flags and output, then the service's limits, and then the protocol itself. You need the protocol only if you write your own client, for example a Python loader that opens a session and checks example queries. For what to do with a session once it is open, read `trace-repl help trace-repl-user-guide`.

## Commands

| Command | What it does | Output |
| --- | --- | --- |
| `serve` | Opens and verifies the evidence, then serves sessions until interrupted. | Log lines on stderr, ending with `trace REPL ready` and the address. |
| `open` | Allocates a session. | The session ID on one line. |
| `eval` | Evaluates one cell from `--code` or stdin, or submits it as a job with `--job`. | The JSON response on one line. With `--job --detach`, the job ID. |
| `job` | Reports a job, with its result once finished, or stops it with `--stop`. | The job view as indented JSON. |
| `close` | Releases a session and its bindings, stopping any job it runs. | Nothing. |
| `sessions` | Lists open sessions. | Indented JSON. |
| `results` | Lists saved results, or prints one record with `--name`. | Indented JSON. |
| `info` | Prints what a running service mounted: archive, studies, repository, sessions and limits. | Indented JSON. |
| `help [slug]` | Shows command help or a help page, such as `trace-repl help trace-repl-js-api`. `help --ui` opens the interactive help browser. | Rendered Markdown. |

Every command exits with status 0 on success and 1 on failure, printing the error on stderr. `eval` also exits with 1 when the cell itself failed (`{"ok": false}`), after printing the response on stdout. A script can therefore check the exit status and still read the error message.

## Flags

### serve

| Flag | Default | Description |
| --- | --- | --- |
| `--addr` | `127.0.0.1:3791` | Loopback `host:port` to listen on. A non-loopback address is refused. |
| `--archive` | required | The `PICOCALC-ROW-IR` ticket directory, or another archive in its format. Every stream is inflated and checked against its manifest digest before the service listens. |
| `--device-study` | none | A `PICOCALC-PIE-LOOPS` ticket directory with measured ESP32-P4 trials, which enables `hardware.*`. |
| `--simd-study` | none | One `p4-simd-evidence-v1` JSON file, which enables `simd.*`. The service verifies its image digests, ranges, PCs and step sums before listening. |
| `--repo` | the git work tree containing the current directory | The repository that `repo.*` and `compiler.at` read. |
| `--mount` | none | `NAME=PATH`, repeatable. One more read-only file, digested at startup and bound as `mounts.NAME`. |
| `--results` | the user cache directory's `picocalc-trace-repl/results` | Where `results.save` writes. |
| `--max-job` | `10m` | The longest deadline a job may have, as a Go duration. |
| `--idle` | `2h` | Unload sessions unused for this long. `0` keeps them until closed. |

### Client commands

| Flag | Commands | Description |
| --- | --- | --- |
| `--addr` | all | The service's address. It must match `serve --addr`. |
| `--session` | `eval`, `job`, `close` (required) | The ID printed by `open`. |
| `--code` | `eval` | The cell's source. Without it, `eval` reads stdin. |
| `--job` | `eval` | Run the code as a background job and wait for its result. |
| `--job-timeout` | `eval` | With `--job`: the deadline in seconds. `0` uses the service's `--max-job`. |
| `--detach` | `eval` | With `--job`: print the job ID and return instead of waiting. |
| `--arg` | `eval` | `NAME=JSON`, repeatable. One parameter, visible as `args.NAME`. `NAME` must be a JavaScript identifier, and the value must be JSON, so a string keeps its quotes: `--arg rev='"worktree"'`. |
| `--args-file` | `eval` | A JSON object file of parameters. `--arg` values replace its fields. |
| `--job-id` | `job` (required) | The ID printed by `eval --job --detach`. |
| `--stop` | `job` | Interrupt the job instead of reporting it. |
| `--name` | `results` | Print this record instead of the list. |

`--arg` is a raw string-array flag, so commas and quotes inside JSON reach the service unchanged: `--arg arms='{"base": {"disable": ["split"]}, "split": {}}'` works. The same name twice, an invalid identifier or invalid JSON is refused before anything is sent.

### Logging (every command)

| Flag | Default | Description |
| --- | --- | --- |
| `--log-level` | `info` | `trace`, `debug`, `info`, `warn`, `error` or `fatal`. `serve --log-level debug` also logs every opened session, evaluated cell and submitted job. |
| `--log-format` | `text` | `text` or `json`. |
| `--log-file` | stderr | Write logs to a file. |
| `--log-to-stdout` | `false` | Also log to stdout when `--log-file` is set. |
| `--with-caller` | `false` | Add the source location to each line. |
| `--log-area`, `--log-config`, `--strict-log-areas` | none | Per-area level overrides and logcopter profiles. |

## Limits

`trace-repl info` reports the limits of a running service under `limits` and `sessions`.

| Limit | Value | When it is exceeded |
| --- | --- | --- |
| Cell source | 64 KiB | HTTP 413. |
| Cell or job result | 512 KiB serialized | The cell fails with `result exceeds 524288 bytes`. Keep the value in a binding and return a smaller selection. |
| `args` | 64 KiB, one JSON object | HTTP 413, or HTTP 400 if it is not an object. |
| Cell deadline | 15 s, including the wait for the session | The cell stops, and bindings from earlier cells remain. |
| Job deadline | `--job-timeout`, at most `--max-job` | The job ends in state `failed` at its deadline. |
| Open sessions | 32 | `POST /sessions` returns HTTP 429. |
| Idle time | `--idle` | The session is unloaded, and later requests get HTTP 404 with the reason. |
| Finished jobs remembered | 16 per session | Older job views are dropped. |
| Repository and mounted files | 32 MiB each | The read fails. |

## HTTP protocol

The service speaks JSON over HTTP on its loopback address. Requests with a body send `Content-Type: application/json`.

| Request | Response |
| --- | --- |
| `GET /` | HTTP 200, the list of routes. |
| `GET /info` | HTTP 200: `{service, build, repo: {root, head}, mounts, compiler: {modules, cachedCommits}, archive, deviceStudy, simdStudy, sessions: {open, max, idleSeconds}, limits: {sourceBytes, resultBytes, argsBytes, cellSeconds, jobSeconds}, results: {dir}, started}`. |
| `POST /sessions` with an empty body | HTTP 201, `{"id": "session-..."}`. HTTP 429 at 32 open sessions. |
| `GET /sessions` | HTTP 200, `[{id, created, lastUsed, idleSeconds, cells, jobs, activeJob, busy}]`, oldest first. |
| `POST /sessions/{id}/eval` with `{"source": "7 * 6"}` | HTTP 200, `{"ok": true, "value": 42}`. |
| the same with `{"source": "args.n + 1", "args": {"n": 41}}` | HTTP 200, `{"ok": true, "value": 42}`. `args` must be one JSON object (HTTP 400 otherwise, 413 over 64 KiB). |
| a JavaScript parse or evaluation error | HTTP 200, `{"ok": false, "error": "..."}`. The next cell still runs. |
| an unknown session | HTTP 404 with a JSON error. For a session unloaded after `--idle`, the error says `session ... expired after 2h0m0s idle`. |
| `POST /sessions/{id}/jobs` with `{"source": "...", "args": {...}, "timeoutSeconds": 600}` | HTTP 202, `{"job": "job-...", "state": "queued", "timeoutSeconds": 600, ...}`. `args` and `timeoutSeconds` are optional. |
| `GET /sessions/{id}/jobs/{job}` | HTTP 200, `{job, session, state, submitted, started, finished, timeoutSeconds, elapsedSeconds, sourceSHA256, sourceBytes, args, result}`. `result` is a cell result once the job has finished. |
| `GET /sessions/{id}/jobs` | HTTP 200, the session's jobs without results, oldest first. |
| `DELETE /sessions/{id}/jobs/{job}` | HTTP 200, the job after it stopped (the service waits up to 5 s). |
| `eval` or a job sent while a job holds the session | HTTP 409, `{"ok": false, "error": "session is busy with job ...", "job": "job-..."}`. |
| `DELETE /sessions/{id}` | HTTP 204. |
| `GET /results` | HTTP 200, `[{name, path, sha256, bytes, saved}]` sorted by name. |
| `GET /results/{name}` | HTTP 200, the record as stored. HTTP 404 for an unknown name. |

### Cell responses

A cell response is `{ok, value, kind?, console?, error?}`:

- `value` is the JSON serialization of the cell's last expression, as `JSON.stringify` would produce it. Properties holding functions or `undefined` are left out, and a typed array becomes an object keyed by index (`{"0": 1, "1": 2}`), so convert it with `Array.from(x)` first.
- `kind` appears when the value itself has no JSON form: `"undefined"` for a declaration or `undefined`, `"function"` for a function. `value` is then `null`.
- `console` holds `[{kind, message}]` for each `console.log`, `info`, `debug`, `warn` or `error` call, up to a limited size.
- `error` replaces `value` when `ok` is `false`. Parse errors, thrown exceptions, deadlines and refused results all arrive this way, with HTTP 200, so that a client can tell a failed cell from a failed request.

### Job states

| State | Meaning |
| --- | --- |
| `queued` | Waiting to enter its session. |
| `running` | Evaluating. The session refuses other work with HTTP 409. |
| `done` | Finished. `result.ok` says whether the cell succeeded. |
| `failed` | The cell threw, or the job reached its deadline. |
| `stopped` | Interrupted by `DELETE`, by `trace-repl job --stop`, by Ctrl-C on a waiting `eval --job`, or by closing its session ("job stopped because its session was closed"). |

### A minimal client

The protocol is small enough to drive from any language. This Python sketch opens a session, evaluates one cell and closes the session:

```python
import json, urllib.request

base = "http://127.0.0.1:3791"

def call(method, path, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(base + path, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        text = resp.read()
        return json.loads(text) if text else None

sid = call("POST", "/sessions")["id"]
try:
    out = call("POST", f"/sessions/{sid}/eval", {"source": "q.run(a.events().count()).value"})
    assert out["ok"], out["error"]          # a failed cell is HTTP 200 with ok: false
    print(out["value"])                     # 4133 on the PICOCALC-ROW-IR archive
finally:
    call("DELETE", f"/sessions/{sid}")
```

## Troubleshooting

| Problem | Cause | Solution |
| --- | --- | --- |
| `serve` exits with `verify evidence archive` | A stream does not match its manifest digest or index header. | The capture is damaged or incomplete. Restore the ticket directory from git; do not serve it. |
| `serve` refuses `--addr 0.0.0.0:3791` | Only loopback addresses are allowed. | Use `127.0.0.1:PORT`, and use an SSH tunnel for remote access. |
| `listen: listen tcp 127.0.0.1:3791: bind: address already in use` | Another service owns the port. | `trace-repl info` shows what it serves. Pick another `--addr` and pass it to every client command. |
| `eval` prints a response and exits 1 | The cell failed. | Read `error` in the response; the session is still usable. |
| HTTP 429 from `open` | 32 sessions are open. | `trace-repl sessions` lists them; close the ones you no longer use. |
| `--arg` refused with `is not JSON` | A bare string was given. | Quote it: `--arg rev='"worktree"'`. |
| A `Uint32Array` such as `frame.counts` arrives as `{"0": ..., "1": ...}` | JSON has no typed arrays. | Return `Array.from(x)`, or better, a summary of it. |
| `info` shows `build.revision: null` | The service runs under `go run`, which records no VCS stamp. | Build the binary with `go build`. Inside a git worktree, add `-buildvcs=false`, because the stamp would name the main checkout's commit. |

## See Also

- `trace-repl help trace-repl-user-guide`: sessions, cells, jobs and results in context.
- `trace-repl help trace-repl-js-api`: what a cell can call.
- `trace-repl help trace-repl-query-examples`: scripts to send with `eval`.
