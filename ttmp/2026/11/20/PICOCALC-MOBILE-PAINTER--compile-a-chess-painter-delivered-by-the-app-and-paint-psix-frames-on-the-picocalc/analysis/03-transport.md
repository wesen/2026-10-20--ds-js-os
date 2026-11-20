---
Title: Carrying a painter and a Chess position across a mailbox
Ticket: PICOCALC-MOBILE-PAINTER
Status: active
Topics: [picocalc, chess, psix]
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: A study of counted delivery, precise packet validation and sender lifetime on the PicoCalc.
WhatFor: Explain how the running Chess app publishes the bytes consumed by the compositor.
WhenToUse: When comparing packet ownership, replay and recovery designs for isolated worlds.
---

# Carrying a painter and a Chess position across a mailbox

Chess and the compositor run as different worlds. Chess owns the position and updates it on key messages. The compositor owns the framebuffer and draws the selected application. In the mobile painter trial, the running Chess app sends the compositor one 6,204-byte typed source file and then smaller messages describing individual positions. A usual position is 313 bytes. The compositor compiles the first message to a reusable drawing function and calls that function with state decoded from later messages. The app can open a game, move the cursor, show legal destinations, and play White against the asynchronous native search using its normal entry points. [Transport design](../design-doc/03-transport.md) · [Compiler study](02-compiler.md)

## Follow the opening position

At world start, Chess resets its board and cursor. Its package contains a generated typed function whose string literals write the painter source, including the final newline, to the app's buffer. The build escapes the source using JSON string syntax because the typed frontend already accepts it in `writeLiteral`. During the first render, the game calls the function and sends the resulting bytes through a counted syscall. The source buffer is then available for later use by the app. The kernel owns its message copy. The compositor authenticates the sender and verifies the exact source bytes against the firmware pin before scheduling compilation. [Source embedding tool](../../../../../../picocalc-os/tools/embed-chess-painter.py) · [Typed publisher](../../../../../../picocalc-os/worlds/chess/mobile-view.typed)

The same render sends the first position. Dense square indices run from 0 at a8 to 63 at h1, so the opening cursor on e2 has index 52. The position contains 64 piece codes, eight legal-destination masks, and nine signed integer fields. Cursor and selection use the same coordinate system as the painter. A selection value of 64 says there is no selected square. Select the e2 pawn and the position now carries `selected = 52` plus destination bits for e3 and e4. Pressing right changes the cursor field to 53. The message still contains the full position, so an admitted snapshot can be rendered even if a previous snapshot was missed.

```text
start                 cursor 52  selected 64  destinations empty
select e2             cursor 52  selected 52  destinations e3 and e4
move to e4 and play   cursor 36  selected 64  last move 52 to 36
black reply           cursor 36  selected 64  last move  1 to 18
```

## Why counted messages carry ownership as well as bytes

The app reuses its output storage. If the receiver held a pointer to that storage, a later render could rewrite bytes before the receiver reads them. The kernel therefore allocates a message with a private copy. The copy includes all interior NUL bytes and has an explicit length. The kernel seals the sender and receiver epochs in the message when accepting it. It delivers only after the sender's segment ends successfully. On the consumer turn, the callback may use the copy during that call. The callback retains its own copy if a compiler worker or later draw needs the bytes. [Kernel queue](../../../../../../picocalc-os/nucleus/kernel.c) · [Native dispatch](../../../../../../picocalc-os/nucleus/native.c)

An epoch changes when the kernel tears down a world. Suppose a Chess message reaches the compositor's mailbox just before Chess is restarted. When the compositor takes the message, the sender epoch differs, so the old position is discarded. If the compositor itself restarts, queued raw messages are purged from its mailbox and scheduled events carrying its previous epoch are discarded. A compositor can request the live game to resend the source and a fresh position. Plain JSON with the type spelling `painter.source` still uses the ordinary message path. The kernel's binary publication operation checks the bundled Chess identity before constructing a raw message. [Executable kernel control](../scripts/transport/mailbox.c)

## Canonicality is a byte property

The PSIX wire format sorts its dictionary by UTF-8 bytes and refers to entries by their rank. If a board string changes, its dictionary rank can change even though it keeps the same length. A patch that writes the new text and leaves the old references can alter what some old IDs mean. The Chess codec reassigns all IDs each time. The board and mask have fixed byte lengths. The nine numeric slots have stable locations, and wide numeric bodies appear at the end. This permits a bounded decoder to read candidate state before committing to its interpretation. It encodes the candidate again and compares the complete reconstructed packet with the original. Any malformed packet leaves the destination state unchanged. This proof applies to the representation and individual field domains. The trusted game still establishes chess invariants such as the number of pieces and the presence of both squares of a last move. The compositor validates the painter’s resulting command stream before using it. [Codec](../../../../../../picocalc-os/sdk/typed/chess-psix.c)

A shared encoder and decoder could agree on the same mistake. The host replay also uses the prior JavaScript PSIX specification as a separate oracle. It provided 47 captured snapshots and 16 cases spanning the signed 20-bit boundary and moving dictionary ranks. Each of the 63 packets matched the C encoder byte for byte. The decoders agreed about 158,776 single-bit changes, of which 17,913 remained valid snapshots. A flipped bit may change a legal number or an admissible piece code, so a test that expects every mutation to fail would reject valid changes. All 19,847 proper prefixes failed without changing the output buffer. The ASan and UBSan runs also checked queue rollback, payload copying, in-flight limits, and old epochs at both delivery boundaries. [Replay commands](../scripts/transport/check.sh)

The live Wasm publisher test captured the exact 6,204-byte source and twelve canonical position packets. It drove a real e2–e4 move, waited through the engine's 78 search slices, and observed b8–c6 with depth 3, 1,600 nodes and score 12. It also checked source replay following an authenticated request and ordinary screen fallback when the publication syscall declines. Those host tests establish behavior at the SDK and kernel boundaries. The physical experiment measures installation, framebuffer reuse, and the time from key injection to completion of the display update. [Live producer](../scripts/transport/live-producer.mjs) · [Physical experiment](04-device.md)

Claude Opus High independently proposed credit-based admission and a full source replay for each receiver incarnation. The implementation uses the single kernel lane's own hard in-flight limits, two epoch checks and a firmware-pinned receiver service. The proposal's mutation and stale-delivery controls informed the tests above. The prompt contained an abstract transport problem and the CLI ran in an isolated temporary directory with tools disabled. [Commission receipt](../scripts/transport/opus-provenance.json) · [Independent response](../scripts/transport/opus-response.md)
