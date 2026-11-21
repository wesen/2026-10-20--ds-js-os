# An unchanged ray subtraction through four compiler stages

Generated from the live inspector. The rows cover the same Typed source and use byte offsets within their own final target images.

## Source and frontend

```js
        for (let x = 0; x < 160; x = x + 1) {
            const discriminant = row - work.charCodeAt(horizontal + x);
            if (discriminant >= 0) {
                const depth = cz - work.charCodeAt(520 + discriminant);
                const previous = work.charCodeAt(1545 + x);
                if (previous === 0 || depth < previous) {
                    work.setCharCodeAt(1545 + x, depth);
                    work.setCharCodeAt(1705 + x, sphere + 1);
                }
```

The Wasm body has 291 operations and 517 bytes. The native input tape below uses cell offsets.

```text
182  local.get 15
184  local.get 16
186  local.get 17
188  i32.add
189  local.set 18
191  text.checked_address 0 18
194  i32.load16_u 1 4
197  i32.sub
198  local.set 19
200  local.get 19
202  i32.const 0
204  i32.ge_s
205  if 64
```

## Inferred facts

```json
{
  "loop": 172,
  "iv": 17,
  "bound": {
    "constant": 160
  },
  "row": {
    "local": 15
  },
  "buffer": 0,
  "base": {
    "local": 16
  },
  "difference": 19,
  "indexSlot": 18,
  "consumerStart": 207,
  "consumerEnd": 292,
  "stores": [
    {
      "buffer": 0,
      "base": {
        "constant": 1545
      }
    },
    {
      "buffer": 0,
      "base": {
        "constant": 1705
      }
    }
  ],
  "lanes": 8
}
```

## Native instructions

| Stock scalar | Matched scalar | PIE |
|---|---|---|
| `dfc lw t0, 60(sp)` | `f50 addi t5, sp, 112` | `f5c addi t5, sp, 112` |
| `e00 lw t1, 64(sp)` | `f54 lhu t6, 0(a5)` | `f60 esp.vld.128.ip q1, a5, 16` |
| `e04 lw t2, 68(sp)` | `f58 sub t6, a4, t6` | `f64 esp.vsub.s16 q2, q0, q1` |
| `e08 add t1, t1, t2` | `f5c sh t6, 0(t5)` | `f68 esp.vst.128.ip q2, t5, 16` |
| `e0c sw t1, 72(sp)` | `f60 lhu t6, 2(a5)` | `f6c addi a3, zero, 8` |
| `e10 lw t5, 72(sp)` | `f64 sub t6, a4, t6` | `f70 jal zero, 0xf88` |
| `e14 lw t6, 0(sp)` | `f68 sh t6, 2(t5)` | `f74 lhu t6, 0(a5)` |
| `e18 lw a0, 0(t6)` | `f6c lhu t6, 4(a5)` | `f78 sub t6, a4, t6` |
| `e1c bltu t5, a0, 0xe24` | `f70 sub t6, a4, t6` | `f7c sh t6, 112(sp)` |
| `e20 ebreak` | `f74 sh t6, 4(t5)` | `f80 addi a5, a5, 2` |
| `e24 slli t1, t5, 1` | `f78 lhu t6, 6(a5)` | `f84 addi a3, zero, 1` |
| `e28 add t1, t6, t1` | `f7c sub t6, a4, t6` | `f88 addi a6, sp, 112` |
| `e2c lhu t1, 4(t1)` | `f80 sh t6, 6(t5)` | `f8c lhu t6, 0(a6)` |
| `e30 sub t0, t0, t1` | `f84 lhu t6, 8(a5)` | `f90 bgeu a4, t6, 0xf98` |
| `e34 sw t0, 76(sp)` | `f88 sub t6, a4, t6` | `f94 jal zero, 0x10b0` |
| `e38 lw t0, 76(sp)` | `f8c sh t6, 8(t5)` | `f98 sw t6, 76(sp)` |
| `e3c addi t1, zero, 0` | `f90 lhu t6, 10(a5)` |  |
| `e40 slt t0, t0, t1` | `f94 sub t6, a4, t6` |  |
| `e44 xori t0, t0, 1` | `f98 sh t6, 10(t5)` |  |
| `e48 bne t0, zero, 0xe50` | `f9c lhu t6, 12(a5)` |  |
| `e4c jal zero, 0xf64` | `fa0 sub t6, a4, t6` |  |
|  | `fa4 sh t6, 12(t5)` |  |
|  | `fa8 lhu t6, 14(a5)` |  |
|  | `fac sub t6, a4, t6` |  |
|  | `fb0 sh t6, 14(t5)` |  |
|  | `fb4 addi a5, a5, 16` |  |
|  | `fb8 addi a3, zero, 8` |  |
|  | `fbc jal zero, 0xfd4` |  |
|  | `fc0 lhu t6, 0(a5)` |  |
|  | `fc4 sub t6, a4, t6` |  |
|  | `fc8 sh t6, 112(sp)` |  |
|  | `fcc addi a5, a5, 2` |  |
|  | `fd0 addi a3, zero, 1` |  |
|  | `fd4 addi a6, sp, 112` |  |
|  | `fd8 lhu t6, 0(a6)` |  |
|  | `fdc bgeu a4, t6, 0xfe4` |  |
|  | `fe0 jal zero, 0x10fc` |  |
|  | `fe4 sw t6, 76(sp)` |  |

Each column lists its own machine sequence in order. Adjacent cells can perform different work. The accelerated columns include the peel and lane sign guard. The once-per-region broadcast occurs in the admission code. The scalar hit continuation and the ordinary fallback also remain in the native image.
