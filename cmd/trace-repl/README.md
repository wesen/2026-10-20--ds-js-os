# Compiler trace REPL

`trace-repl` opens the PicoCalc LLVM capture once on the host. Each session has its own JavaScript VM. Bind a query, a derived table or a closure to a variable and use it in later cells. Session variables last until the session closes or the server exits.

## Start and query

Run these commands from the repository root. The Go module uses the adjacent checkout `../go-go-golems/go-go-goja` (tested at tag `v0.10.7`). Go selects toolchain 1.26.10.

```sh
tmux new-session -d -s trace-repl \
  'go run ./cmd/trace-repl serve --archive ttmp/2026/11/21/PICOCALC-ROW-IR--trace-the-ray-row-through-gcc-and-llvm-optimization-passes'
tmux capture-pane -pt trace-repl -S -10
sid=$(go run ./cmd/trace-repl open)
go run ./cmd/trace-repl eval --session "$sid" --code 'q.help()'
go run ./cmd/trace-repl eval --session "$sid" --code 'const doubled = n => n * 2'
go run ./cmd/trace-repl eval --session "$sid" --code 'doubled(21)'
go run ./cmd/trace-repl close --session "$sid"
```

The server writes a readiness record with its address. To choose another port, give every command the same `--addr 127.0.0.1:PORT`. Server logs support `--log-level debug`. The CLI also reads multi-line programs from stdin when `--code` is absent.

## HTTP protocol

| Request | Response |
| --- | --- |
| `POST /sessions` with empty body | HTTP 201, `{"id":"session-…"}` |
| `POST /sessions/{id}/eval` with `Content-Type: application/json` and `{"source":"7 * 6"}` | HTTP 200, `{"ok":true,"value":42}` |
| JS parse or evaluation error | HTTP 200, `{"ok":false,"error":"…"}`. A subsequent valid cell can still run. |
| Unknown session | HTTP 404 with a JSON error |
| `DELETE /sessions/{id}` | HTTP 204 |

A declaration produces `"value":null,"kind":"undefined"`. A cell can emit `console.log`, `info`, `debug`, `warn` or `error`, which appear in the response's optional `console` array. End a cell with a data value to see it as JSON. Return `undefined` explicitly when you want to keep a large binding without transporting its contents. For example, `const values = [1,2,3]; undefined`, followed by `values.length` in a new cell. Redeclaring a top-level lexical binding is a JavaScript error. Use `let` for names that you want to reassign.

Evaluations within a session execute serially. The execution deadline is 15 seconds including the wait to enter that session. Separate sessions can execute concurrently over the archive. A standalone `await expression` cell can consume an immediately settled promise. Ordinary multi-statement cells follow script syntax. The API operates on local evidence synchronously. Promise-based external I/O has no event source.

Use this service with trusted researchers on a local machine. It binds a loopback address and provides the selected archive and standard JavaScript objects. It omits a general host module loader. The evaluator caps the size of incoming source and outgoing serialized results and captures a limited amount of console output. JavaScript can still allocate memory in the host process. For jobs that require a hard process-memory limit, choose an operating-system resource boundary for the server.
