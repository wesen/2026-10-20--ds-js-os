| Scene | Size | First image (ms) | Coarse / half (ms) | First full pass (s) | Later pass (s) | Samples/s | Cycles/sample | Display (ms) | Peak heap PSRAM / internal (bytes) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| B-01 | 160 | 233 | 125 / 6527 | 7.47 | 0.926 | 27,442 | 13,086 | 145.2 | 1,628,580 / 9,336 |
| R-01 | 160 | 358 | 207 / 667 | 1.96 | 1.575 | 16,461 | 21,836 | 143.9 | 747,564 / 4,200 |

| Scene | Passes | Device frame 0 | acc | display | = RV32 | = x86-64 (frame 0, acc, display) | Mean luminance ratio | Cycles/sample | RV32 instr/sample | CPI |
|---|---:|---|---|---|---|---|---:|---:|---:|---:|
| B-01 | 4 | e2ba6956 | 3b52c63c | 23d7885f | yes | no/no/yes | 1.0 | 13,545 | 5743.6 | 2.358 |
| R-01 | 4 | e8421c97 | 2ac5b8e1 | 1d7de02e | yes | yes/yes/yes | 1.0 | 20,687 | 11061.5 | 1.87 |
| W-02 | 4 | 34a669ff | 865eba2b | dd654b4c | yes | yes/yes/yes | 1.0 | 31,592 | 16004.6 | 1.974 |
| X-04 | 4 | 2b9af109 | a0aafa50 | 450d2ead | yes | yes/yes/yes | 1.0 | 77,983 | 40442.0 | 1.928 |
| S-02 | 4 | e32b0f6b | a4d9bc0b | 4785e5ad | yes | yes/yes/yes | 1.0 | 51,775 | 25566.9 | 2.025 |

| Scene | PSRAM stack, below the kernel task | Internal stack, below the kernel task | Internal stack, above the kernel task | Same digests |
|---|---:|---:|---:|---|
| B-01 | 13,545 | 13,219 | 8,622 | yes |
| R-01 | 20,687 | 20,429 | 14,662 | yes |
| W-02 | 31,592 | 31,016 | 21,861 | yes |
| X-04 | 77,983 | 77,204 | 55,934 | yes |
| S-02 | 51,775 | 50,360 | 35,769 | yes |
