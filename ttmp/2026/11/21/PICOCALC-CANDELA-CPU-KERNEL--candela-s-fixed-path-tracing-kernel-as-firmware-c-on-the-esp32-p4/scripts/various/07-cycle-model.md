## The parent's assumed model against measurement

| arm | scene | instructions | model low-high | measured | measured / model high |
|---|---|---:|---:|---:|---:|
| wgsl | B-01 | 9,338 | 11,318-15,769 | 15,114 | 0.96 |
| wgsl | R-01 | 11,023 | 13,100-17,544 | 15,530 | 0.89 |
| wgsl | L-03 | 8,382 | 10,210-14,329 | 13,667 | 0.95 |
| wgsl | G-01 | 12,837 | 15,402-21,242 | 19,915 | 0.94 |
| wgsl | E-02 | 4,242 | 5,167-7,077 | 5,730 | 0.81 |
| wgsl | W-02 | 79,715 | 89,392-105,098 | 102,960 | 0.98 |
| lazy | B-01 | 8,524 | 10,362-14,580 | 13,854 | 0.95 |
| lazy | R-01 | 10,315 | 12,271-16,531 | 14,621 | 0.88 |
| lazy | L-03 | 7,557 | 9,235-13,096 | 12,312 | 0.94 |
| lazy | G-01 | 12,012 | 14,436-20,047 | 18,577 | 0.93 |
| lazy | E-02 | 4,030 | 4,928-6,834 | 5,724 | 0.84 |
| lazy | W-02 | 78,914 | 88,460-103,975 | 101,554 | 0.98 |
| cpu | B-01 | 4,419 | 5,451-7,873 | 6,853 | 0.87 |
| cpu | R-01 | 9,534 | 11,393-15,613 | 12,887 | 0.83 |
| cpu | L-03 | 3,409 | 4,278-6,317 | 5,342 | 0.85 |
| cpu | G-01 | 8,240 | 9,935-13,961 | 11,976 | 0.86 |
| cpu | E-02 | 3,535 | 4,372-6,251 | 4,916 | 0.79 |
| cpu | W-02 | 13,890 | 16,262-21,933 | 19,387 | 0.88 |
| proto | B-01 | 8,521 | 10,361-14,565 | 13,794 | 0.95 |
| proto | R-01 | 10,289 | 12,243-16,487 | 14,231 | 0.86 |
| proto | L-03 | 7,559 | 9,239-13,090 | 12,222 | 0.93 |
| proto | G-01 | 11,934 | 14,353-19,928 | 18,435 | 0.93 |
| proto | E-02 | 3,957 | 4,847-6,740 | 5,452 | 0.81 |
| proto | W-02 | 78,832 | 88,361-103,828 | 101,026 | 0.97 |

## Bracket from the microbenchmarks (cycles per sample)

| arm | scene | issue-bound | latency-bound | measured |
|---|---|---:|---:|---:|
| wgsl | B-01 | 11,470 | 19,897 | 15,114 |
| wgsl | R-01 | 12,956 | 22,735 | 15,530 |
| wgsl | L-03 | 10,403 | 17,938 | 13,667 |
| wgsl | G-01 | 15,457 | 27,375 | 19,915 |
| wgsl | E-02 | 5,218 | 8,742 | 5,730 |
| wgsl | W-02 | 82,164 | 136,086 | 102,960 |
| lazy | B-01 | 10,532 | 18,433 | 13,854 |
| lazy | R-01 | 12,151 | 21,500 | 14,621 |
| lazy | L-03 | 9,438 | 16,426 | 12,312 |
| lazy | G-01 | 14,513 | 25,900 | 18,577 |
| lazy | E-02 | 5,006 | 8,462 | 5,724 |
| lazy | W-02 | 81,265 | 134,700 | 101,554 |
| cpu | B-01 | 5,633 | 10,069 | 6,853 |
| cpu | R-01 | 11,369 | 20,573 | 12,887 |
| cpu | L-03 | 4,495 | 7,911 | 5,342 |
| cpu | G-01 | 10,042 | 18,361 | 11,976 |
| cpu | E-02 | 4,511 | 7,881 | 4,916 |
| cpu | W-02 | 15,938 | 29,930 | 19,387 |

## Effective cycles per event: instruction classes only (non-negative least squares over 108 arm x scene cells)

| event | cycles each | events per B-01 cpu sample | share of B-01 cpu cycles |
|---|---:|---:|---:|
| integer and memory (alu, mul, div, branch, jump, load, store, flw, fsw) | 0.77 | 3,277 | 37% |
| FP add, mul, min/max, sign, compare, convert | 1.80 | 817 | 21% |
| FP fused multiply-add | 8.47 | 258 | 32% |
| fdiv.s and fsqrt.s | 12.95 | 67 | 13% |

Fit error: median 2.4%, max 11.8% of measured cycles.

## Effective cycles per event: instruction classes and cache misses (non-negative least squares over 108 arm x scene cells)

| event | cycles each | events per B-01 cpu sample | share of B-01 cpu cycles |
|---|---:|---:|---:|
| integer and memory (alu, mul, div, branch, jump, load, store, flw, fsw) | 0.95 | 3,277 | 45% |
| FP add, mul, min/max, sign, compare, convert | 1.12 | 817 | 13% |
| FP fused multiply-add | 6.53 | 258 | 25% |
| fdiv.s and fsqrt.s | 9.00 | 67 | 9% |
| L1 instruction-cache miss | 1.05 | 852 | 13% |
| L1 data-cache miss | 0.00 | 5 | 0% |

Fit error: median 1.1%, max 5.6% of measured cycles.
