---
Title: 'The PicoCalc agent: analysis, design and implementation guide'
Ticket: PICOCALC-AGENT
Status: active
Topics:
    - picocalc
    - esp32-p4
    - agent
    - wifi
    - llm
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/js/system/agent.js
      Note: agent service, dialect translation, tool loop
    - Path: repo://picocalc-os/nucleus/vm.c
      Note: agent.* and store.* operations
    - Path: repo://picocalc-os/port/esp32p4/main/agent_p4.c
      Note: P4 HTTPS transport, Wi-Fi, net console
    - Path: repo://picocalc-os/port/esp32p4/main/bus_p4.c
      Note: console key injection
    - Path: repo://picocalc-os/port/esp32p4/sdkconfig.agent-wifi
      Note: ESP-Hosted mode and PSRAM placement
    - Path: repo://picocalc-os/tools/provision_agent.py
      Note: provisioning from local sources
ExternalSources: []
Summary: How the imported PicoCalc agent works end to end (worlds, native HTTPS, ESP-Hosted Wi-Fi, NVS), what the first hardware run found, and the design for talking to an OpenAI-compatible Chat Completions provider (lunaroute, deepseek-4.1-flash).
LastUpdated: 2026-10-31T22:00:00-04:00
WhatFor: Onboarding an intern to the agent feature, and the plan the PICOCALC-AGENT implementation follows.
WhenToUse: Before changing js/system/agent.js, js/apps/chat.js, the agentNet/store bindings, or the ESP32-P4 network port.
---

# The PicoCalc agent: analysis, design and implementation guide

This guide explains how a language-model agent runs on the PicoCalc: a pocket computer with a 320×320 screen,
a physical keyboard and, in our build, an ESP32-P4 processor board with an ESP32-C6 radio beside it. It is
written for someone who has not seen this repository. By the end you should be able to say what each world,
each C file and each byte on the wire is for; follow one question from a key press to the model and back;
and know exactly what this ticket changes.

The agent code itself was written outside this repository and handed over as a zip
(`picocalc-agent-complete.zip`, baseline commit `3e0bcfa`). It was imported unchanged in commit `11fa24c`.
It spoke only OpenAI's *Responses* API and had never run on hardware. This ticket runs it on the real
PicoCalc and teaches it the *Chat Completions* dialect, which the provider we have (lunaroute, model
`deepseek-4.1-flash`) speaks. The first hardware run already found and fixed three problems (commit
`87941fe`); they are described in section 9 because each one teaches something about the system.

## 1. The system in one page

picocalc-os is a small operating system whose programs are JavaScript. A C *nucleus* runs many isolated
JavaScript programs, called **worlds**, one at a time on a single execution lane. Drivers, the window
system and the apps are all worlds. The C code does only what JavaScript cannot do safely or quickly: talk
to buses, draw pixels, keep time, and now open HTTPS connections and write flash.

```text
 +------------------------------ PicoCalc (ESP32-P4) -------------------------------+
 |                                                                                  |
 |  JavaScript worlds (one QuickJS runtime each, one runs at a time)                |
 |  +----------+ +---------+ +---------+ +------------+ +------+ +-------+         |
 |  | keyboard | |  power  | | display | | compositor | | chat | | agent |  ...    |
 |  +----+-----+ +----+----+ +----+----+ +-----+------+ +--+---+ +---+---+         |
 |       | publish keys         | flush         | key / frames  |send   | agentNet  |
 |  =====v======================v===============v===============v=======v======    |
 |  nucleus (C): kernel.c scheduler, mailboxes, deferred effects; vm.c bindings     |
 |  =====+======================+===============+=======================+======    |
 |       | i2c0                 | spi2          |                       | port_agent_*
 |  +----v-----+          +-----v-----+   +-----v------+          +------v-------+  |
 |  | STM32    |          | ST7365P   |   | NVS flash  |          | agent-net    |  |
 |  | keyboard |          | LCD panel |   | partitions |          | task (C)     |  |
 |  +----------+          +-----------+   +------------+          +------+-------+  |
 |                                                                       | SDIO     |
 |                                                         +-------------v-------+  |
 |                                                         | ESP32-C6 radio      |  |
 |                                                         | (ESP-Hosted slave)  |  |
 |                                                         +-------------+-------+  |
 +-----------------------------------------------------------------------|----------+
                                                                         | Wi-Fi, TLS
                                                              https://gw.lunaroute.com
```

The agent adds two worlds and one native service:

- **`chat`** (`js/apps/chat.js`) is the screen you type into. It owns the draft text and the scroll
  position, nothing else. It holds no claims, so it cannot reach the network or the store.
- **`agent`** (`js/system/agent.js`) owns the conversation, the request bodies, the tool loop, notes and
  approvals. It holds the claim `net.agent`, which is what allows it to call the native transport.
- **The native transport** (`port_agent_*` in C) posts one bounded JSON body to one HTTPS endpoint that was
  configured on the device, and adds the bearer token itself. JavaScript never sees the URL or the token.

The model runs on a server. The PicoCalc runs the orchestration: it builds the prompt, executes tools
locally (a calculator, device status, notes), asks the user before writing anything, and keeps a bounded
history.

## 2. Concepts you need first

### 2.1 Worlds, turns and segments

A **world** is one JavaScript program with its own QuickJS runtime, its own heap limit (`mem_kb`) and its
own time budget per run (`budget_ms`). A world is declared in `js/system.json`:

```json
{ "name": "agent", "file": "system/agent.js", "claims": ["net.agent", "sys.read"],
  "budget_ms": 100, "mem_kb": 1536, "store_kb": 16 }
```

Worlds never share memory. They communicate only with messages: `send(to, type, payload)` delivers to one
world, `publish(channel, payload)` to every subscriber. A world's handler runs when a message arrives; that
run is a **turn**. Turns are cut into **segments** at every `await`. The kernel (`nucleus/kernel.c`) runs one
segment at a time on the single lane, charges it against the world's budget, and kills a world that
overruns or exhausts its heap.

The rule that shapes everything in the agent: **a handler that is still waiting keeps its world busy**. If
the agent awaited a 10-second HTTP request inside its `agent.submit` handler, it could not receive
`agent.cancel` until the request finished. So the agent never waits on the network inside a handler. It
starts a request, returns at once, and looks at the request again from a 100 ms timer.

### 2.2 Deferred effects

Anything a segment does to the outside world (a bus transfer, a store write, starting an HTTP request) is
not done immediately. It is recorded as a **deferred effect** (`deferred_t` in `nucleus/nucleus.h`) and
applied in order when the segment ends cleanly. If the segment throws or is killed, its effects are
discarded. Two consequences you will see in the agent code:

- `store.set()` returns before anything reaches flash; `store.status()` on a *later* turn reports whether
  the write succeeded. That is why a note write reports "saved" one tick after approval.
- `agentNet.start()` returns a ticket number immediately, but the native request starts only when the
  segment ends. A segment that faults after calling `start` never sends anything (there is a test for this,
  `test_failed_segment_does_not_start_network`).

### 2.3 Claims and message senders

A **claim** is a manifest entry that grants a world a privilege: `i2c0:0x1f` lets the keyboard driver talk
to the keyboard chip; `net.agent` lets the agent use the transport; `sys.read` lets it list worlds. The C
binding checks the claim on every call (`world_claims(W, "net.agent")` in `nucleus/vm.c`).

Every message carries its sender. A handler receives it as the third argument:

```js
.on("agent.submit", (s, payload, msg) => { if (msg.from !== "chat") return; ... })
```

`msg.from` is the sending world's name, or `null` when the kernel itself sent it (for example the
`worlds.status` notices). No world can forge another's name. The imported code uses this heavily: the agent
accepts commands only from `chat`, chat accepts state only from `agent`, and the compositor accepts key
events only from `keyboard` and frames only from the app they describe. The last two checks keep a
misbehaving world from drawing a fake approval prompt or pressing F4 ("allow") on the user's behalf.

### 2.4 The host simulator

`make` builds `build/picocalc-host`, which runs the same nucleus and the same JavaScript on Linux against
simulated chips (`sim/st7365p.c` for the panel, `sim/stm32kbd.c` for the keyboard). Time is *virtual*: the
simulator models how long work takes, so runs are repeatable and screenshots are byte-identical. A script
drives it:

```text
wait 500
key c
type What is 17*23?
key enter
wait 3000
shot agent-answer
```

The `-r` option, added by the import, paces virtual time to the wall clock. That is needed only when a
real HTTPS request runs on a worker thread, because 45 virtual seconds can pass in a few real milliseconds.

## 3. The hardware path

### 3.1 Boards and buses

| Part | What it is | How the OS reaches it | Files |
|---|---|---|---|
| ESP32-P4 (rev 1.3, 360 MHz, 32 MB PSRAM) | Main processor; runs the nucleus and all worlds | — | `port/esp32p4/main/*.c` |
| STM32 "southbridge" at I2C 0x1F | Scans the keyboard, keeps a key FIFO, reads the battery | i2c0, SDA 50, SCL 49, 10 kHz | `js/drivers/keyboard.js`, `js/drivers/power.js`, `bus_p4.c` |
| ST7365P LCD, 320×320 | The screen | spi2 at 40 MHz | `js/drivers/display.js`, `bus_p4.c` |
| ESP32-C6 | Wi-Fi radio; runs Espressif's ESP-Hosted *slave* firmware | SDIO 4-bit, 20 MHz, pins 14–19, reset GPIO 54 | ESP-Hosted component, `sdkconfig.agent-wifi` |
| CH343 USB-serial | The console (`/dev/ttyACM0`), also used for flashing | UART0, 115200 | `main_p4.c` (console), `tools/p4cap.py` |

The P4 has no radio of its own. Espressif's **ESP-Hosted** project makes the C6 act as a Wi-Fi adapter:
the P4 runs the *host* half (`espressif/esp_hosted` 1.4.2 plus `espressif/esp_wifi_remote` 0.14.0), which
provides the normal `esp_wifi_*` API and forwards each call over SDIO to the C6, and the C6 runs the
*slave* half. Packets travel over SDIO too; lwIP (the TCP/IP stack) and mbedTLS run on the P4.

### 3.2 FreeRTOS tasks on the P4

| Task | Core | Prio | Job |
|---|---|---|---|
| `kernel` | 1 | 5 | The nucleus: runs worlds, applies effects, settles finished transfers. The only task that touches `K` or a JS engine. |
| `console` | 0 | 3 | Reads UART lines and queues them to the kernel task (`p4_kq`). |
| `bus_i2c0`, `bus_spi2` | 0 | 6 | Do bus transfers and queue the results back. |
| `agent-net` | 0 | 3 | Wi-Fi bring-up, SNTP, and the one HTTPS request at a time. Never touches `K`. |
| ESP-Hosted, lwIP, Wi-Fi remote | 0/1 | up to 23 | Espressif's own tasks. |

The rule "only the kernel task touches kernel state" is what keeps the design simple: every other task
communicates through a queue or a mutex-protected slot, and the kernel task picks results up when it polls.

### 3.3 Flash layout

```text
port/esp32p4/partitions.csv
  nvs         0x9000   24 KB   credentials: namespace "agentcfg" (ssid, password, token, endpoint[, model])
  phy_init    0xf000    4 KB
  factory     0x10000   4 MB   the application (2.2 MB with Wi-Fi)
  agentstore  0x410000 128 KB  world records: namespace "w", one blob per world (the agent's session, notes)
```

Credentials and world data live in different partitions on purpose: `net forget` erases the first without
touching notes, and no JavaScript call can name the credential namespace (`store_p4.c` accepts only the
namespaces `w` and `k`).

## 4. Following one question end to end

The user opens Agent (key `c` on the home screen), types `What is 17*23?` and presses Enter.

```text
 keyboard      compositor        chat               agent                    C (kernel task)      agent-net task      lunaroute
    |  keys{c}     |                |                   |                          |                    |                 |
    |------------->| focus chat     |                   |                          |                    |                 |
    |  keys{W..}   |  key           |                   |                          |                    |                 |
    |------------->|--------------->| draft += ch       |                          |                    |                 |
    |  keys{enter} |  key           |                   |                          |                    |                 |
    |------------->|--------------->| agent.submit{text}|                          |                    |                 |
    |              |                |------------------>| build body; agentNet.start(body) -> ticket 7  |                 |
    |              |                |                   |------------------------->| defer run_agent_start                  |
    |              |                |  agent.state      | (handler returns)        | segment ends: port_agent_start         |
    |              |                |<------------------|                          |------------------->| POST (TLS)      |
    |              |                |                   | every 100 ms: poll(7)    |                    |---------------->|
    |              |                |                   |------------------------->| null (pending)     |                 |
    |              |                |                   |        ...               |                    |<----------------|
    |              |                |                   | poll(7)                  |  {status,body}     | 200, tool_calls |
    |              |                |                   |<-------------------------|                    |                 |
    |              |                |                   | validate; run calculate("17*23") = 391 (local)|                 |
    |              |                |                   | agentNet.start(continuation) -> ticket 8      |                 |
    |              |                |                   |    ... same polling ...  |                    | POST            |
    |              |                |                   | poll(8) -> "17 x 23 = 391"                    |                 |
    |              |                |  agent.state(done)|                          |                    |                 |
    |              |                |<------------------| history += exchange; store.set("session")     |                 |
```

Step by step, with the code that does it:

1. **Keys.** `keyboard.js` polls the STM32 every 20 ms (`readReg(REG_KEY)` gives the FIFO count, then one
   `readReg(REG_FIF)` per event) and publishes each event on `keys`. The compositor forwards it to the
   focused app as a `key` message (`js/system/compositor.js`, the `keys` handler).
2. **Draft.** `chatKey()` in `chat.js` edits the draft. Enter sends `agent.submit {text}`.
3. **Submit.** `submit()` in `agent.js` checks the sender and the size limits, handles `/commands`, starts a
   *run* (a run is one user question and every model request it takes), sets a 3-minute deadline, saves the
   session, and calls `startRequest()`.
4. **Request.** `requestBody()` builds the JSON (section 5) and `agentNet.start(body)` returns a ticket.
   The phase becomes `requesting` and a snapshot goes to chat, whose status line shows "Waiting for model... | deepseek-4.1-flash".
5. **Native.** When the segment ends, `run_agent_start()` (`nucleus/vm.c`) calls `port_agent_start()`.
   On the P4 that copies the body into PSRAM and wakes the `agent-net` task, which opens the TLS connection,
   writes the body in 2 KB chunks, and reads at most 64 KB back, checking for cancellation between chunks.
6. **Poll.** Every 100 ms `tick()` calls `agentNet.poll(ticket)`: `null` while pending, then
   `{status, body, error}` exactly once.
7. **Validate.** `response()` parses the body and validates the *whole* batch (types, call ids, argument
   sizes, the tool limit) before anything runs. A malformed or incomplete response runs no tool.
8. **Tools.** One tool per tick (`nextTool()`), each in its own short turn. `save_note` stops at the
   `approval` phase until the user presses F4 (allow) or F5 (deny) on the keyboard.
9. **Continue.** With all tool results appended, `startRequest()` sends the continuation. At most 6 model
   requests and 8 tool calls per run.
10. **Finish.** A response with text and no calls ends the run: the prompt and the visible answer join the
    history (at most 6 exchanges, 10 KB), and the session is saved to the store.

## 5. The two wire formats

### 5.1 What the imported code sends: Responses

OpenAI's Responses API (`POST /v1/responses`) takes an `input` list of *items* and returns an `output` list
of items. Function calls and their results are items of their own:

```json
{ "model": "gpt-6-luna", "instructions": "You are a focused assistant on a PicoCalc...",
  "input": [ {"role": "user", "content": "What is 17*23?"},
             {"type": "function_call", "call_id": "c1", "name": "calculate", "arguments": "{\"expression\":\"17*23\"}"},
             {"type": "function_call_output", "call_id": "c1", "output": "{\"ok\":true,\"value\":391}"} ],
  "tools": [ {"type": "function", "name": "calculate", "description": "...", "strict": true, "parameters": {...}} ],
  "parallel_tool_calls": false, "store": false, "stream": false, "max_output_tokens": 2048,
  "reasoning": {"effort": "low"}, "include": ["reasoning.encrypted_content"] }
```

A response has `status: "completed"` and `output: [ {type:"reasoning"...}, {type:"message", content:[{type:"output_text", text}]}, {type:"function_call", call_id, name, arguments} ]`.

The agent's internal state is built from these items: `s.input` is the item list of the active run, and
`response()` validates `output` items. Keep that in mind; it is why the new dialect is added as a
translation layer rather than a rewrite.

### 5.2 What lunaroute speaks: Chat Completions

`~/.pi/agent/models.json` describes the provider as `"api": "openai-completions"` with
`baseUrl: https://gw.lunaroute.com/v1`. That is the older and more widely implemented OpenAI dialect,
`POST /v1/chat/completions`, served here by vLLM. Measured from the laptop (2026-10-31; the model list from
`GET /v1/models` names it `deepseek-4.1-flash`; the id `deepseek-v4-flash` in models.json returns 404
`INFERENCE_MODEL_NOT_FOUND`):

```json
request:  { "model": "deepseek-4.1-flash",
            "messages": [ {"role": "system", "content": "Be brief."},
                          {"role": "user", "content": "What is 17*23? Use the calculate tool."} ],
            "tools": [ {"type": "function", "function": {"name": "calculate", "description": "...", "parameters": {...}}} ],
            "max_tokens": 2048, "stream": false }
response: 200, 939 bytes, 2.4 s
          { "choices": [ { "finish_reason": "tool_calls",
                           "message": { "role": "assistant", "content": null, "reasoning": null,
                                        "tool_calls": [ { "id": "chatcmpl-tool-ac92000da65f6a9d", "type": "function",
                                                          "function": { "name": "calculate", "arguments": "{\"expression\": \"17*23\"}" } } ] } } ],
            "usage": { "prompt_tokens": 304, "completion_tokens": 40 } }

continuation: messages += {"role":"assistant","content":null,"tool_calls":[...same...]},
                          {"role":"tool","tool_call_id":"chatcmpl-tool-ac92000da65f6a9d","content":"{\"ok\":true,\"value\":391}"}
response: 200, 802 bytes, 1.0 s, finish_reason "stop", content "17 × 23 = **391**"
```

With `"reasoning_effort": "low"` the model also fills `message.reasoning` with its chain of thought
(a few hundred bytes for a short question). The agent never shows or resends it.

### 5.3 The mapping

| Internal item (Responses form) | Chat Completions form |
|---|---|
| `instructions` | first message `{role:"system", content}` |
| `{role:"user"\|"assistant", content}` | the same message |
| `{type:"message", role:"assistant", content:[{type:"output_text", text}]}` followed by `{type:"function_call"...}` items | one `{role:"assistant", content: text or null, tool_calls:[...]}` |
| `{type:"function_call", call_id, name, arguments}` | `tool_calls[i] = {id: call_id, type:"function", function:{name, arguments}}` |
| `{type:"function_call_output", call_id, output}` | `{role:"tool", tool_call_id: call_id, content: output}` |
| `{type:"reasoning"}` | dropped |
| tools `{type, name, description, strict, parameters}` | `{type:"function", function:{name, description, parameters}}` |
| `max_output_tokens` | `max_tokens` |
| `reasoning: {effort}` | `reasoning_effort: effort` (omitted for `/effort omit`) |
| `store`, `include` | not sent |
| response `status: "completed"` | `finish_reason` is `stop` or `tool_calls` |
| response `status: "incomplete"` | `finish_reason` is `length` or `content_filter` |

Pseudocode for the two directions:

```text
chatRequest(s):
  messages = [{role: system, content: INSTRUCTIONS}]
  for item in s.input:
    if item.role:                          messages.push({role, content})
    elif item.type == "message":           pending = {role: assistant, content: text(item), tool_calls: []}; messages.push(pending)
    elif item.type == "function_call":     if last message is not an assistant message awaiting calls: push a new one
                                           last.tool_calls.push({id: call_id, type: function, function: {name, arguments}})
    elif item.type == "function_call_output": messages.push({role: tool, tool_call_id: call_id, content: output})
    elif item.type == "reasoning":         skip
  return {model, messages, tools: chatTools, parallel_tool_calls: false, stream: false,
          max_tokens: 2048, reasoning_effort?: effort}

chatToOutput(body):                       -> the same {status, output} shape response() already validates
  c = body.choices[0]; m = c.message
  status = finish_reason in (stop, tool_calls) ? "completed" : "incomplete"
  output = []
  if m.content: output.push({type: message, role: assistant, content: [{type: output_text, text: m.content}]})
  if m.refusal: output.push(... {type: refusal, refusal} ...)
  for t in m.tool_calls: output.push({type: function_call, call_id: t.id, name: t.function.name,
                                      arguments: t.function.arguments, status: completed})
  return {status, output}
```

Everything after the translation (validation, tool execution, approval, history) is unchanged, which is the
point: the tested policy code keeps working for both providers.

### 5.4 Who decides the dialect

The dialect belongs to the endpoint, and only the native side knows the endpoint. So the native side reports
it: `agentNet.status()` returns `{configured, mode, api, model}`, where `api` is `"chat"` when the
configured URL path ends in `/chat/completions` and `"responses"` otherwise, and `model` is the default
model provisioned with the endpoint (empty if none). On the host the same values come from
`PICOCALC_AGENT_URL`, `PICOCALC_AGENT_MODEL` and, for fixtures, `PICOCALC_AGENT_API`.

The model choice has three sources, in this order: a model the user picked with `/model`, the provisioned
model, the built-in default. The session record remembers only a user-picked model, so re-provisioning
the device changes the model unless the user chose one explicitly.

## 6. The native transport contract

### 6.1 JavaScript side (`js/prelude.js`)

| Call | Returns | Notes |
|---|---|---|
| `agentNet.status()` | `{configured, mode, api, model}` | `mode`: `https`, `fixture`, `offline`, `disabled`. `api` and `model` are new in this ticket. |
| `agentNet.start(json)` | ticket (integer) | Throws if busy, unconfigured, or the body is not 1..49152 bytes. One request at a time. |
| `agentNet.poll(ticket)` | `null` or `{status, body, error}` | The result is handed over once; then the ticket is dead. Non-UTF-8 or >64 KB bodies become errors. |
| `agentNet.cancel(ticket)` | `true`/`false` | Logical cancel at once; the worker exits at its next chunk boundary. |
| `store.get(key, fallback)`, `store.set(key, v)`, `store.remove(key)`, `store.all()` | values (copies) | One JSON record per world, quota `store_kb` (16 KB for the agent). |
| `store.status()` | `{pending, error}` | Whether the last staged write reached flash. |

All of them require the `net.agent` claim except the store calls, which any world has.

### 6.2 C side (`nucleus/nucleus.h`)

```c
#define AGENT_NET_REQUEST_MAX 49152
#define AGENT_NET_RESPONSE_MAX 65536
#define AGENT_NET_TIMEOUT_MS 45000
typedef struct { int status; char *body; char error[160]; } agent_net_result_t;
bool port_agent_configured(void);
const char *port_agent_mode(void);
const char *port_agent_api(void);      /* new: "chat" or "responses" */
const char *port_agent_model(void);    /* new: the provisioned default model, or "" */
int port_agent_start(int ticket, const char *body, size_t len, char *error, size_t error_size);
int port_agent_poll(int ticket, agent_net_result_t *result);   /* 0 pending, 1 done, -1 gone */
void port_agent_cancel(int ticket);
char *port_store_get(const char *ns, const char *key, size_t *len);
int port_store_set(const char *ns, const char *key, const void *data, size_t len);
```

`nucleus/vm.c` owns the ticket bookkeeping (`agent_request`): which world owns the active request, its epoch
(a restarted world gets a new epoch, so it cannot poll its predecessor's request), and the 45-second
deadline. The ports only move bytes.

| Port | File | Behaviour |
|---|---|---|
| Host, default | `host/agent_host.c` | `PICOCALC_AGENT_FIXTURES=dir`: request *n* is answered with `dir/00n.json` (optional `.status`, `.delay_ms`) after virtual time. No network. |
| Host, `make AGENT_LIVE=1` | `host/agent_host.c` | libcurl on a pthread; `PICOCALC_AGENT_URL`, `PICOCALC_AGENT_TOKEN`, optional `PICOCALC_AGENT_CA_FILE`. HTTPS only, no redirects. |
| P4, offline build | `port/esp32p4/main/agent_p4.c` | Stubs: `mode` "disabled". |
| P4, `-D PICOCALC_AGENT_WIFI=ON` | `port/esp32p4/main/agent_p4.c` | `agent-net` task, `esp_http_client` with the certificate bundle, SNTP before the first request. |

### 6.3 The P4 console's `net` commands

```text
net status                  configured=yes wifi=up clock=set state=...      (never prints values)
net ssid NAME               saved in NVS agentcfg
net password VALUE          8..64 bytes, or empty for an open network
net token VALUE             the bearer token, printable ASCII, no spaces
net endpoint HTTPS_URL      e.g. https://gw.lunaroute.com/v1/chat/completions
net model ID                new: the default model, e.g. deepseek-4.1-flash
net connect                 apply Wi-Fi settings
net forget                  erase all of agentcfg
```

`tools/provision_agent.py` types these for you. This ticket adds sources so no secret is ever typed or
committed: `--wifi-from-nm SSID` reads the passphrase NetworkManager stored, and `--pi-provider lunaroute`
reads the endpoint and key from `~/.pi/agent/models.json`.

## 7. Safety properties worth preserving

The imported code was written defensively, and most of it should stay exactly as it is. When you change
anything near these, keep the property:

- **Credentials never enter JavaScript.** The token is added by C. A model cannot ask for a different URL or
  header; there is no API for it.
- **Model output is data.** Nothing from a response is evaluated. `calculate` is a hand-written arithmetic
  parser, not `eval`.
- **Whole-batch validation.** No tool runs from a response until every item in it has been checked.
- **Physical approval for writes.** `save_note` waits for F4 on the keyboard; F5 or two minutes deny.
  The compositor's sender checks exist so no other world can press F4.
- **Bounded everything.** Prompt 2 KB, request 48 KB, response 64 KB, 6 requests, 8 tools, 3 minutes a run,
  45 s a request, 16 KB of saved session.
- **No automatic replay.** A run interrupted by a reboot is shown as cancelled, never resumed.

## 8. Building, flashing, testing

```sh
# host: build and the agent test suite (no network)
cd picocalc-os && make -j8 && make test-agent

# host against the real provider (libcurl; secrets from the environment, never from files in the repo)
make AGENT_LIVE=1 -j8
PICOCALC_AGENT_URL=https://gw.lunaroute.com/v1/chat/completions PICOCALC_AGENT_TOKEN=... \
PICOCALC_AGENT_MODEL=deepseek-4.1-flash build-agent/picocalc-host -r scripts-agent/live.txt

# device: the Wi-Fi build (ESP-IDF 5.4.2), flash, provision, watch
. ~/esp/esp-idf-5.4.2/export.sh
cd port/esp32p4
idf.py -B build-agent -D PICOCALC_AGENT_WIFI=ON -D SDKCONFIG=sdkconfig.agent \
       -D 'SDKCONFIG_DEFAULTS=sdkconfig.defaults;sdkconfig.agent-wifi' -p /dev/ttyACM0 build flash
cd ../.. && python3 tools/provision_agent.py --port /dev/ttyACM0 --wifi-from-nm yolobolo \
       --pi-provider lunaroute --model deepseek-4.1-flash
python3 tools/p4cap.py --no-reset -s 40 -c "2 key c" -c "4 type What is 17*23?" -c "6 key enter" \
       -c "30 shot" --shot-dir /tmp/shots
```

`tools/p4cap.py` without `--no-reset` resets the P4 through the CH343's RTS line; with it, the board keeps
running. Its `shot` decoding needs a quiet console: if Wi-Fi logs interleave with the base64 lines, take
the shot again.

## 9. What the hardware runs found

The first three were found on 2026-10-31 with the unmodified import, and fixed in `87941fe`. Each is a small lesson
about the system.

1. **A second `net connect` crashed the board.** `assert failed: netif_add ... (netif already added)` from
   lwIP's thread, then a reset. The original `wifi_apply()` restarted a running radio with
   `esp_wifi_stop()` + `esp_wifi_start()`. Over ESP-Hosted the second "station started" event arrives before
   the first network interface is torn down, and the default handler adds it to lwIP twice. A running
   station now takes new settings the documented way: `esp_wifi_disconnect()`, `esp_wifi_set_config()`,
   `esp_wifi_connect()`.
2. **TLS stalled with "Len from slave[1689] exceeds max [1536]".** The C6's firmware batches several SDIO
   packets into one transfer (ESP-Hosted's *streaming* mode). The import had chosen packet mode, assuming an
   old C6 firmware; the board's C6 needs streaming, which is also ESP-Hosted's default. With
   `CONFIG_ESP_HOSTED_SDIO_OPTIMIZATION_RX_STREAMING_MODE=y` a request reached lunaroute over verified TLS.
3. **Console keys stopped working.** The P4 console's `key` and `type` commands published `keys` as the
   kernel (`msg.from === null`), and the import's compositor accepts keys only from `keyboard`. Rather than
   loosen that check, the console now queues its events in the I2C back end (`bus_p4_inject_key()`): the
   keyboard controller's status register counts them and its FIFO register returns them first, so the
   keyboard driver reads and publishes them exactly like typed keys.

The runs with the Chat Completions code (A5) found three more, fixed in `4a9657b`:

4. **The model apologised for a save it had made.** History keeps only the user's text and the visible answer
   (the import's policy, section 5). After an approved, confirmed `save_note`, the next question showed the
   model its own "note saved" with no tool call before it, and the instructions say "never claim a tool
   succeeded before its result confirms success": it concluded it had lied. Each finished answer now records
   its tool outcomes (`"save_note: saved"`), and the device states them in brackets at the start of the next
   user message. The first attempt put the note inside the assistant's message; the model then called it "a
   fake saved line" it had written. In three live follow-ups afterwards, two were clean and one still added a
   needless correction.
5. **The display driver died on `spi2: ESP_ERR_NO_MEM`.** Internal RAM on the Wi-Fi build: 472 KB free in
   `app_main`, 149 KB four seconds later (worlds booted, ESP-Hosted up), then 138 KB with a 31 KB largest
   block after the first TLS sessions. An SPI device re-add needs internal memory and failed; the supervisor
   restarted the display world (green banner "display is running again"). mbedTLS, Wi-Fi/lwIP buffers and
   mallocs above 4 KB now go to PSRAM (`sdkconfig.agent-wifi`): after requests the largest block stays at
   65-69 KB, free at ~150 KB.
6. **Trailing blank lines** in model text showed on screen; the translator trims them.

Measured on the final firmware (`4a9657b`), device on the home Wi-Fi:

| Question | Requests | Result |
|---|---|---|
| "What is 1234*5678? Use the calculator." | 2 | `calculate`, "1234 * 5678 = 7,006,652" |
| "Save a note called shop with the text milk and eggs." | 2 + F4 | approval panel, "save_note: saved", answer |
| reboot, `/notes` | 0 | history and note restored from `agentstore` |
| "What is in my shop note?" | 2 | `read_note`, "milk and eggs" |
| "What is the square root of 1764? Use the calculator." | 2 | `calculate`, "42" |

A request takes 1-3 s at lunaroute (measured from the laptop: 2.4 s for a tool call, 1.0 s for the
continuation). Captures are in the ticket's `captures/` directory.

Not yet explained:

- **JavaScript is slower with Wi-Fi up.** `bench` in a running Wi-Fi build: 100k-loop 1,601 ms and
  `fib(20)` 277 ms, against 114 ms and 43 ms at boot of the same build and 113 ms / 29 ms on the offline build.
  The UI stays responsive, but turn budgets assume the offline speed.
- **Where 320 KB of internal RAM goes at boot** on the Wi-Fi build (472 KB → 149 KB before Wi-Fi connects).
- Once, after a flash, the keyboard controller NACKed every I2C transfer (2,155 errors in 45 s) until the
  device was power-cycled by hand. It did not recur.

## 10. Implementation plan

| Phase | Work | Validation |
|---|---|---|
| A0 | Import the zip unchanged; run its tests; flash it; find and fix the hardware problems | done: `11fa24c`, `87941fe` |
| A1 | Native `api`/`model`: `port_agent_api()`, `port_agent_model()` on host and P4, `agent.status` returns them, `net model` console command | done `19afacf`: `test_status_reports_api_and_model` |
| A2 | `agent.js`: Chat Completions request builder and response translator; model precedence; dialect shown in `/help` | done `19afacf`: 5 node tests, the integration tour through `tests/fixtures/agent-chat/` |
| A3 | `provision_agent.py`: `--model`, `--pi-provider`, `--wifi-from-nm`, no reset on open | done `e11ca7c`: provisioned the device |
| A4 | Host live run against lunaroute with `make AGENT_LIVE=1` | done `e11ca7c`: `scripts-agent/live.txt`, captures `host-live-*` |
| A5 | Device run: a calculation, a note save with F4 approval, a reboot that restores the session | done `4a9657b` (plus the fixes in §9 items 4-6), captures `p4-*` |
| A6 | Write-up: diary, this guide's measured section, reMarkable upload | done |

## 11. Open questions

- History without tool calls (section 5) keeps the session small, but the model still sometimes doubts its
  earlier tool use (one follow-up in three). Keeping compact tool-call/tool-result pairs in history would
  remove the doubt at the cost of bytes and of the import's simpler policy.
- The JavaScript slowdown with Wi-Fi up and the 320 KB of internal RAM used at boot (section 9) both need a
  profile: per-task stack high-water marks (`uxTaskGetStackHighWaterMark`), `heap_caps_print_heap_info`, and
  the kernel task's core and priority against ESP-Hosted's tasks.
- Should the agent show DeepSeek's `reasoning` text, perhaps folded? It costs response bytes and screen
  space; currently dropped.
- The approval check lets only the keyboard world press F4. The console's injected keys now pass through
  it, as typed keys. Is anyone with the UART trusted to approve? (They can already set the token.)
- ESP-Hosted host 1.4.2 against an unknown C6 firmware version: should we flash a matching slave image to
  the C6? That needs the C6's own programming pads.
- Response streaming (`stream: true`) would show text as it arrives. It needs an incremental native read
  and a different poll result shape; out of scope here.

## 12. File reference

| File | Role |
|---|---|
| `picocalc-os/js/system/agent.js` | Agent service: limits, instructions, tools, request bodies, validation, tool loop, approval, history |
| `picocalc-os/js/apps/chat.js` | Chat app: draft, wrapping, scrolling, phase display, approval panel |
| `picocalc-os/js/system/compositor.js` | Focus, input routing, sender checks on `keys` and `frames` |
| `picocalc-os/js/prelude.js` | `agentNet` and `store` for the QuickJS build |
| `picocalc-os/js/system.json` | Manifest: `agent` (claims `net.agent`, `sys.read`, store 16 KB) and `chat` |
| `picocalc-os/nucleus/vm.c` | `agent.*` and `store.*` operations, ticket ownership, deadline |
| `picocalc-os/nucleus/nucleus.h` | The port contract |
| `picocalc-os/host/agent_host.c` | Host transport: fixtures, libcurl |
| `picocalc-os/host/port_host.c` | Host store (memory or files, atomic replace) |
| `picocalc-os/port/esp32p4/main/agent_p4.c` | P4 transport, Wi-Fi, SNTP, `net` console |
| `picocalc-os/port/esp32p4/main/store_p4.c` | NVS: credentials partition and `agentstore` |
| `picocalc-os/port/esp32p4/main/bus_p4.c` | I2C/SPI workers; console key injection |
| `picocalc-os/port/esp32p4/sdkconfig.agent-wifi` | ESP-Hosted SDIO pins and mode, TLS bundle |
| `picocalc-os/tests/*.mjs`, `tests/*.py` | Node unit tests of the JS, native tests through the host binary |
| `picocalc-os/tools/provision_agent.py` | Sends the `net` settings over the console |
| `picocalc-os/docs/picocalc-agent-implementation.md` | The import's own guide (Responses-only, before hardware) |
