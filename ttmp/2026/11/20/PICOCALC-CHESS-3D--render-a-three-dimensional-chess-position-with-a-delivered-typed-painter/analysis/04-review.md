---
Title: Does packing the board vertices make the whole Chess painter faster?
Ticket: PICOCALC-CHESS-3D
DocType: analysis
Status: active
Topics: [compiler, graphics, picocalc]
---

# Does packing the board vertices make the whole Chess painter faster?

The PicoCalc Chess world sends a painting program to a compositor. The compositor compiles the source to native code, supplies a normalized position and receives a list of drawing commands. One experiment replaced a two-dimensional board with projected faces for the board and pieces. A second showed that the ESP32-P4's Processor Instruction Extensions (PIE) could compute eight independent 16-bit coordinates at a time. This review tests what happens when those packed instructions execute inside the delivered painting program.

On the physical PicoCalc, selecting PIE reduced the complete *batched* painter's native-call cost by approximately 1.9% relative to guarded scalar code across three cursor positions. The captured application pixels matched exactly, and a marker written by the packed path confirmed it ran. The original scene projected individual points and needed no private coordinate buffers. For the opening it retired 129814 instructions in the host model, versus 142114 for the packed rewrite. Preparing the arrays and looking up their projected points cost more model instructions than the batch transform saved. No paired physical timing compares the original and rewritten painters. [Independent native results](../scripts/review/combined-host.json) · [Physical timing results](../scripts/review/physical-packed-timing.json)

## A square has four corners and the board has 81

The playing surface uses two coordinate axes x and z. Its height y is zero. A square measures sixteen units on either axis. Its adjacent square shares two of its four corners. Across eight squares in each direction, there are nine grid lines in each dimension and 81 distinct corners. At grid column c and row r, the transform takes (16c,0,16r). With the default camera setting of five, its screen position is (160+16c−16r, 42+10c+10r). The point at c = 8, r = 8 therefore appears at (160,202).

The original painter projects four corners in the loop for each of its 64 tiles and passes each result directly to its triangle emitter. The batched source builds six private buffers: three contain the x, y and z columns, the other three hold projected x, projected y and depth. It projects the 81 points and lets each square read the four screen points it needs. The square at column f, row r uses vertex indices 9r+f, 9r+f+1, 9r+f+10 and 9r+f+9. This arrangement changes the program's work before it changes any machine instructions. [Generated source and corner mapping](../scripts/packed/01-source.mjs)

The eligible projection itself is ordinary Typed. For a point on the playing surface its three results are 384+x−z, 640+x+z and x+z. The scene subtracts 224 from the first and uses 42+(second−640)×pitch/8 for the vertical position. These formulas reproduce the original screen coordinates. The depth column is written even though this renderer only uses the first two projected columns. The 3D pieces, raised rim edges, raster operations and text keep their original paths.

## Observe the instruction path and the geometry independently

At eight lanes per vector, 81 vertices require ten packed groups plus a one-point scalar tail. The compiler emits a guarded prefix. It checks the buffers' capacities, data alignment and relevant overlaps before executing the packed loads and stores. For the final point it re-enters the original scalar loop with index 80. A program could return plausible-looking commands while leaving this one point untouched. The reviewer therefore inspected each of the six scratch columns after every call and derived all 81 expected values independently from board coordinates. The sample at (8,8) tests the tail and one of the outer board corners simultaneously. [Independent machine runner](../scripts/review/combined.mjs)

The review executed the original point-at-a-time native code, ordinary batched native code, a guarded scalar specialization of the batch, and the packed batch. An independent WebAssembly implementation ran the two Typed source programs. Each native result was compared with its own interface's whole memory arena, and every emitted command word was compared with the original painter. A disabled guard would defeat the performance experiment while preserving correct output. To test reachability, the machine interpreter decoded the actual image with Espressif's disassembler and attributed each executed PIE instruction to its function. Only project contained a packed instruction. Each of 51 eligible calls reached exactly 200 of those instructions, including 30 eight-lane stores. Main pieces and text emitted none. [Native image identities and per-call counts](../scripts/review/combined-host.json)

The controls changed one payload alignment at a time for each of the six buffers, then deliberately made the projected x and input x buffers refer to exactly the same object. All seven controls executed zero packed instructions and emitted the original commands. The test alternated old scratch data and a distinguishable fill pattern, checked the output tail, headers, camera position cell and every byte outside the declared write region. The host uses controlled addresses; device alignment depends on how the receiver allocates its private buffers.

## The application image

The 47 original game inputs include repeated states with identical visible output. The four additional controls move the cursor by one square in two positions and change camera pitch from five to three or seven. Raw command equality covers triangle order, face colors, glyphs and text. To check the resulting application image directly, the driver saved the exact command bytes returned by each native packed call. I rendered those through the existing independently derived half-plane triangle raster and small-font renderer, then compared the raw RGB565 image digest with the corresponding frozen scalar image. All 51 digests matched across 35 distinct images. Each covered 95360 pixels in 320 columns and 298 application-owned rows including the hint strip. The kernel owns the top 22 screen rows. [Pixel checker](../scripts/review/check-pixels.py) · [Frozen image hashes](../various/host-poses.json)

## Whole-painter cost

| Native program | Machine bytes | Opening retired instructions |
| --- | ---: | ---: |
| Original point-at-a-time scene | 9572 | 129814 |
| Batched lattice, ordinary RV32 | 10884 | 152189 |
| Batched lattice, guarded scalar RV32 | 11672 | 145021 |
| Batched lattice, eight-lane PIE | 11640 | 142114 |

The batch rewrite added 22375 retired instructions to the opening before either compiler specialization ran. The guarded scalar path recovered 7168 instructions and applying the packed path recovered a further 2907. The complete packed scene still retired 12300 more instructions than the original, a 9.48% increase. The 49 default-pitch calls each added 12300 instructions. The two alternate-camera controls each added 12316 because the original renderer enters its parameterized camera routine directly. The batch transforms the complete ground grid even when the Chess position changes only the cursor. A retired instruction count describes the operations the host model executed. The P4's pipeline, memory and caches determine the cost in cycles. [Independent count table](../scripts/review/combined-host.json)

## Who owns the scratch memory?

The experimental paint function has eight arguments. The receiver passes the game state and command buffer first, followed by x, y, z, projected x, projected y and depth. The first two retain their original meaning. The other six point to the compositor's private storage. Each Typed pointer addresses a 32-bit capacity immediately followed by 16-bit cells. Cell 81 of y stores the current camera pitch. Cells 0 through 80 can be rewritten each frame. No packet contains a scratch pointer, and no retained drawing command refers back to one.

The compositor allocates one 1152-byte block in internal memory for each loaded painter, with the allocator explicitly required to return a 16-byte-aligned address. Every 192-byte channel has twelve bytes of leading padding, its four-byte capacity, then cells at offset sixteen. The 192-byte stride leaves the next channel aligned. All channels advertise 82 cells. The compositor checks each data address and capacity before calling the generated code. A synchronous kernel-side call consumes the state, and only the returned command words are copied to the service's separately owned drawing list. A failed scratch allocation releases the relocated module and its handle. [Receiver staging](../scripts/packed/03-stage.py)

Independent review caught an initial mismatch at the module boundary. The receiver called the new eight-argument function, but the C stub inside the relocated module still described it as a two-argument function and wrote the function pointer through that older type. Both sides now agree. A second staging defect gave a paired-image entry conflicting visibility declarations. After correction I compiled the actual staged load, run, and free routines with the actual module-side handoff, replacing only the hardware, allocator and generated-function dependencies with test doubles. It accepted two calls on reused storage, rejected a damaged capacity before writing output, and released all allocations and modules on four distinct failed installs. The test also checks the declared C function types at compile time. [Lifecycle test](../scripts/review/check-receiver.py) · [Checked allocator and entry](../scripts/review/receiver-mock.c)

## Separating a hardware-path witness from the timing code

The research firmware links three closed copies of the same painter into one 49152-byte executable slot. One runs the packed projection and writes a diagnostic marker, one runs the packed projection uninstrumented, and one uses the guarded scalar implementation. The comparison can call two addresses over the same game state and the same memory allocation without reinstalling a program. The marker lives in depth cell 81, outside the 81 vertices and inside the advertised capacity. The receiver clears it before each observed call. The compiler's inserted store writes 0xabcd only after the packed loop for count 81 and capacity at least 82.

I verified this layout in the completed 50252-byte ELF itself. I decoded the three entry jumps, found their destinations, and compared the full 11640-byte raw packed program and 11672-byte guarded program with independently regenerated machine images. I then executed each actual entry stub with an aligned buffer set and with one misaligned buffer. Only the aligned diagnostic entry wrote the marker. The aligned raw entry executed the same 30 vector stores without disturbing that cell. All six runs reproduced the opening position. This check gives a physical marker reading a concrete meaning while keeping its store outside the timed entry. [ELF verification](../scripts/review/check-linked.mjs) · [Linked entry receipts](../scripts/review/linked-paired.json)

## Three physical frames and the measured saving

The receiving PicoCalc reported one installation and one compilation of the 7965-byte delivered source. The board's source and linked-image byte counts and checksums matched the host artifacts. The temporary measuring module was 50252 bytes and took 1962756 μs to compile all three versions and 1441 μs to relocate. Each of the three observed calls produced the marker 0xabcd for a buffer capacity of 82, a stride of 192 bytes and 3281 returned command words. I independently calculated the drawing-list checksum from the host native bytes and compared it with the board. Its input included face geometry, colors, piece labels and hints.

For the opening and two cursor changes I compared every physical framebuffer byte for the 320-by-298 application rectangle with the rendered host machine output. All three matched. Their completed SPI observer CRCs were 9bfb0fa8, 372bf81b and 65a21193. Each observer had completed its window and reported zero faults. These checks reach the display driver's completed writes. The experiment had no observation of optical panel scanout. [Physical byte and SPI checks](../scripts/review/physical-packed-pixels.json)

The paired timing command runs on the kernel's owning core. The stamp is verified with the diagnostic entry. The command warms the uninstrumented packed and guarded scalar entries in turn, takes eleven measurements per arm and reverses their order on successive samples. Each number is the whole native call's average over eight repetitions as recorded by the CPU cycle counter. The module verifies the returned drawing words against a private reference copy after each measured batch. The same current game state, executable module and scratch allocation are used throughout.

| Cursor | Guarded scalar median, cycles | Raw PIE median, cycles | Median cycles saved per pair | Median paired reduction |
| --- | ---: | ---: | ---: | ---: |
| e2 | 188920 | 185356 | 3568 | 1.889% |
| e3 | 188936 | 185363 | 3585 | 1.897% |
| f3 | 188923 | 185342 | 3559 | 1.884% |

Raw PIE took fewer cycles in all 33 same-position pairs. The paired reduction is calculated from the two measurements in each trial before taking the median. This accounts for the small differences between the fourth column and simply subtracting the two arm medians. All draws occurred on core 1 in one firmware session. Neither rasterization nor a panel transfer ran inside the timing loop. The original point-at-a-time implementation ran in a separate firmware experiment. We therefore have a positive physical result for replacing guarded scalar arithmetic inside the *batched* painter, and a higher model instruction count for the complete rewrite compared with the *original* painter. A paired on-device comparison with the original would settle the remaining whole-implementation cost question. [Independent timing calculation](../scripts/review/physical-packed-timing.json)

For this version, retain the original painter as the everyday implementation. The alternative used 1152 extra bytes of internal RAM per installed renderer and 2068 extra machine-code bytes in its uninstrumented program compared with the original. Its verified physical saving is about 1.9% within a specially batched native invocation, before raster and display time. If drawing this lattice becomes a real bottleneck, first compare reuse of the 81 immutable ground points across frames: cursor and piece movement change game state, and the ordinary camera pitch stays fixed. Such reuse changes the work at the source level and deserves its own scalar control.

## Reproducing the independent checks

Run the packed source generator, then the independent combined runner with the resulting Typed file, the frozen scene's 47-state fixtures.bin and a temporary output directory. It writes the actual packed-machine command bytes for the pixel comparator. The linked-image checker additionally takes the paired reactor ELF. The receiver harness takes an isolated staged tree and the arm name paired. The physical comparison scripts take the operator's capture directory and the previously written native command words. Source, image and fixture hashes in the receipts make the measured revisions inspectable. [Machine and geometry checks](../scripts/review/combined.mjs) · [Linked slot checks](../scripts/review/check-linked.mjs) · [Physical timing checks](../scripts/review/check-paired.py)
