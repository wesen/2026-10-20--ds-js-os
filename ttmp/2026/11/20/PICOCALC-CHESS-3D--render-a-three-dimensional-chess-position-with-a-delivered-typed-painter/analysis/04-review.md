---
Title: Does packing the board vertices make the whole Chess painter faster?
Ticket: PICOCALC-CHESS-3D
DocType: analysis
Status: active
Topics: [compiler, graphics, picocalc]
---

# Does packing the board vertices make the whole Chess painter faster?

The PicoCalc Chess world sends a painting program to a compositor. The compositor compiles the source to native code, supplies a normalized position and receives a list of drawing commands. One experiment replaced a two-dimensional board with projected faces for the board and pieces. A second showed that the ESP32-P4's Processor Instruction Extensions (PIE) could compute eight independent 16-bit coordinates at a time. This review tests what happens when those packed instructions execute inside the delivered painting program.

On the host, the combined painter produced the original commands and all 51 expected application images. Its generated instructions reached the packed loop on every eligible call. For the opening position, the packed version retired 142114 instructions in the host model. The original point-at-a-time painter retired 129814. Three distinct costs explain how a correct local optimization can have this outcome: preparing the coordinate arrays, transforming the vertices, and looking up the projected points while emitting the commands. [Independent native results](../scripts/review/combined-host.json) · [Image results](../scripts/review/combined-pixels.json)

## A square has four corners and the board has 81

The playing surface uses two coordinate axes x and z. Its height y is zero. A square measures sixteen units on either axis. Its adjacent square shares two of its four corners. Across eight squares in each direction, there are nine grid lines in each dimension and 81 distinct corners. At grid column c and row r, the transform takes (16c,0,16r). With the default camera setting of five, its screen position is (160+16c−16r, 42+10c+10r). The point at c = 8, r = 8 therefore appears at (160,202).

The original painter projects four corners in the loop for each of its 64 tiles and passes each result directly to its triangle emitter. The batched source builds six private buffers: three contain the x, y and z columns, the other three hold projected x, projected y and depth. It projects the 81 points and lets each square read the four screen points it needs. The square at column f, row r uses vertex indices 9r+f, 9r+f+1, 9r+f+10 and 9r+f+9. This arrangement changes the program's work before it changes any machine instructions. [Generated source and corner mapping](../scripts/packed/01-source.mjs)

The eligible projection itself is ordinary Typed. For a point on the playing surface its three results are 384+x−z, 640+x+z and x+z. The scene subtracts 224 from the first and uses 42+(second−640)×pitch/8 for the vertical position. These formulas reproduce the original screen coordinates. The depth column is written even though this renderer only uses the first two projected columns. The 3D pieces, raised rim edges, raster operations and text keep their original paths.

## Observe the instruction path and the geometry independently

At eight lanes per vector, 81 vertices require ten packed groups plus a one-point scalar tail. The compiler emits a guarded prefix. It checks the buffers' capacities, data alignment and relevant overlaps before executing the packed loads and stores. For the final point it re-enters the original scalar loop with index 80. A program could return plausible-looking commands while leaving this one point untouched. The reviewer therefore inspected each of the six scratch columns after every call and derived all 81 expected values independently from board coordinates. The sample at (8,8) tests the tail and one of the outer board corners simultaneously. [Independent machine runner](../scripts/review/combined.mjs)

The review executed the original point-at-a-time native code, ordinary batched native code, a guarded scalar specialization of the batch, and the packed batch. An independent WebAssembly implementation ran the two Typed source programs. Each native result was compared with its own interface's whole memory arena, and every emitted command word was compared with the original painter. A disabled guard would defeat the performance experiment while preserving correct output. To test reachability, the machine interpreter decoded the actual image with Espressif's disassembler and attributed each executed PIE instruction to its function. Only project contained a packed instruction. Each of 51 eligible calls reached exactly 200 of those instructions, including 30 eight-lane stores. Main pieces and text emitted none. [Native image identities and per-call counts](../scripts/review/combined-host.json)

The controls changed one payload alignment at a time for each of the six buffers, then deliberately made the projected x and input x buffers refer to exactly the same object. All seven controls executed zero packed instructions and emitted the original commands. The test alternated old scratch data and a distinguishable fill pattern, checked the output tail, headers, camera position cell and every byte outside the declared write region. The host uses controlled addresses; device alignment depends on how the receiver allocates its private buffers.

## The application image

The 47 original game inputs include repeated states with identical visible output. The four additional controls move the cursor by one square in two positions and change camera pitch from five to three or seven. Raw command equality covers triangle order, face colors, glyphs and text. To check the resulting application image directly, the driver saved the exact command bytes returned by each native packed call. I rendered those through the existing independently derived half-plane triangle raster and small-font renderer, then compared the raw RGB565 image digest with the corresponding frozen scalar image. All 51 digests matched across 35 distinct images. Each covered 95360 pixels: 320 columns and 298 application-owned rows including the hint strip. The kernel owns the top 22 screen rows. [Pixel checker](../scripts/review/check-pixels.py) · [Frozen image hashes](../various/host-poses.json)

## Whole-painter cost

| Native program | Machine bytes | Opening retired instructions |
| --- | ---: | ---: |
| Original point-at-a-time scene | 9572 | 129814 |
| Batched lattice, ordinary RV32 | 10884 | 152189 |
| Batched lattice, guarded scalar RV32 | 11672 | 145021 |
| Batched lattice, eight-lane PIE | 11640 | 142114 |

The batch rewrite added 22375 retired instructions to the opening before either compiler specialization ran. The guarded scalar path recovered 7168 instructions and applying the packed path recovered a further 2907. The complete packed scene still retired 12300 more instructions than the original, a 9.48% increase. The 49 default-pitch calls each added 12300 instructions. The two alternate-camera controls each added 12316 because the original renderer enters its parameterized camera routine directly. The batch transforms the complete ground grid even when the Chess position changes only the cursor. A retired instruction count describes the operations the host model executed. The P4's pipeline, memory and caches determine the cost in cycles. [Independent count table](../scripts/review/combined-host.json)

The independent ABI and physical measurements below are specific to the staged receiving compositor and its temporary firmware.

## Who owns the scratch memory?

The experimental paint function has eight arguments. The receiver passes the game state and command buffer first, followed by x, y, z, projected x, projected y and depth. The first two retain their original meaning. The other six point to the compositor's private storage. Each Typed pointer addresses a 32-bit capacity immediately followed by 16-bit cells. Cell 81 of y stores the current camera pitch. Cells 0 through 80 can be rewritten each frame. No packet contains a scratch pointer, and no retained drawing command refers back to one.

The compositor allocates one 1152-byte block in internal memory for each loaded painter, with the allocator explicitly required to return a 16-byte-aligned address. Every 192-byte channel has twelve bytes of leading padding, its four-byte capacity, then cells at offset sixteen. The 192-byte stride leaves the next channel aligned. All channels advertise 82 cells. The compositor checks each data address and capacity before calling the generated code. A synchronous kernel-side call consumes the state, and only the returned command words are copied to the service's separately owned drawing list. A failed scratch allocation releases the relocated module and its handle. [Receiver staging](../scripts/packed/03-stage.py)

Independent review caught an initial mismatch at the module boundary. The receiver called the new eight-argument function, but the C stub inside the relocated module still described it as a two-argument function and wrote the function pointer through that older type. Both sides now agree. A second staging defect gave a paired-image entry conflicting visibility declarations. After correction I compiled the actual staged load, run, and free routines with the actual module-side handoff, replacing only the hardware, allocator and generated-function dependencies with test doubles. It accepted two calls on reused storage, rejected a damaged capacity before writing output, and released all allocations and modules on four distinct failed installs. The test also checks the declared C function types at compile time. [Lifecycle test](../scripts/review/check-receiver.py) · [Checked allocator and entry](../scripts/review/receiver-mock.c)
