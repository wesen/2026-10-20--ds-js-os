## Cycles per sample (median of warm frames), instructions per sample, CPI, digest check

| arm | B-01 | R-01 | L-03 | G-01 | E-02 | W-02 |
|---|---|---|---|---|---|---|
| wgsl | 15,114 / 9,338 = 1.62 | 15,530 / 11,023 = 1.41 | 13,667 / 8,382 = 1.63 | 19,915 / 12,837 = 1.55 | 5,730 / 4,242 = 1.35 | 102,960 / 79,715 = 1.29 |
| lazy | 13,854 / 8,524 = 1.63 | 14,621 / 10,315 = 1.42 | 12,312 / 7,557 = 1.63 | 18,577 / 12,012 = 1.55 | 5,724 / 4,030 = 1.42 | 101,554 / 78,914 = 1.29 |
| noinit | 13,344 / 8,176 = 1.63 | 13,852 / 9,881 = 1.40 | 11,947 / 7,263 = 1.64 | 17,926 / 11,620 = 1.54 | 5,352 / 3,745 = 1.43 | 100,408 / 78,342 = 1.28 |
| floor | 13,286 / 8,175 = 1.63 | 13,860 / 9,880 = 1.40 | 11,923 / 7,262 = 1.64 | 17,871 / 11,619 = 1.54 | 5,318 / 3,722 = 1.43 | 99,834 / 77,627 = 1.29 |
| trig | 12,139 / 7,189 = 1.69 | 13,287 / 9,501 = 1.40 | 10,742 / 6,294 = 1.71 | 16,843 / 10,677 = 1.58 | 4,960 / 3,535 = 1.40 | 22,875 / 15,255 = 1.50 |
| exp | 10,350 / 6,178 = 1.68 | 13,095 / 9,537 = 1.37 | 8,951 / 5,241 = 1.71 | 15,289 / 9,798 = 1.56 | 4,965 / 3,535 = 1.40 | 22,477 / 15,298 = 1.47 |
| hash | 10,430 / 6,178 = 1.69 | 13,173 / 9,537 = 1.38 | 9,064 / 5,241 = 1.73 | 15,345 / 9,798 = 1.57 | 4,962 / 3,535 = 1.40 | 19,693 / 13,893 = 1.42 |
| cpu | 6,853 / 4,419 = 1.55 | 12,887 / 9,534 = 1.35 | 5,342 / 3,409 = 1.57 | 11,976 / 8,240 = 1.45 | 4,916 / 3,535 = 1.39 | 19,387 / 13,890 = 1.40 |
| cpu-lazy | 8,390 / 5,172 = 1.62 | 14,105 / 10,227 = 1.38 | 7,052 / 4,168 = 1.69 | 13,728 / 9,018 = 1.52 | 5,119 / 3,776 = 1.36 | 21,261 / 14,696 = 1.45 |
| cpu-noinit | 7,390 / 4,766 = 1.55 | 13,665 / 9,971 = 1.37 | 5,858 / 3,700 = 1.58 | 12,685 / 8,631 = 1.47 | 5,314 / 3,820 = 1.39 | 20,433 / 14,469 = 1.41 |
| cpu-floor | 6,845 / 4,430 = 1.55 | 12,949 / 9,543 = 1.36 | 5,409 / 3,421 = 1.58 | 11,946 / 8,250 = 1.45 | 4,943 / 3,562 = 1.39 | 19,456 / 13,945 = 1.40 |
| cpu-trig | 7,562 / 4,888 = 1.55 | 13,650 / 9,944 = 1.37 | 5,937 / 3,797 = 1.56 | 12,701 / 8,754 = 1.45 | 5,192 / 3,711 = 1.40 | 20,684 / 14,677 = 1.41 |
| cpu-exp | 6,950 / 4,415 = 1.57 | 12,893 / 9,498 = 1.36 | 5,396 / 3,398 = 1.59 | 12,109 / 8,237 = 1.47 | 4,918 / 3,535 = 1.39 | 19,303 / 13,847 = 1.39 |
| cpu-hash | 6,915 / 4,419 = 1.56 | 13,189 / 9,534 = 1.38 | 5,407 / 3,409 = 1.59 | 12,035 / 8,240 = 1.46 | 4,964 / 3,535 = 1.40 | 22,618 / 15,295 = 1.48 |
| cpu-O3 | 6,735 / 4,280 = 1.57 | 12,675 / 9,238 = 1.37 | 5,311 / 3,310 = 1.60 | 11,921 / 8,026 = 1.49 | 4,905 / 3,471 = 1.41 | 19,230 / 13,605 = 1.41 |
| cpu-iram | 6,908 / 4,438 = 1.56 | 13,068 / 9,604 = 1.36 | 5,424 / 3,416 = 1.59 | 12,104 / 8,285 = 1.46 | 4,948 / 3,550 = 1.39 | 19,677 / 13,956 = 1.41 |
| mono | 6,935 / 4,413 = 1.57 | 12,790 / 9,507 = 1.35 | 5,451 / 3,405 = 1.60 | 12,132 / 8,163 = 1.49 | 4,746 / 3,407 = 1.39 | 19,251 / 13,825 = 1.39 |
| proto | 13,794 / 8,521 = 1.62 | 14,231 / 10,289 = 1.38 | 12,222 / 7,559 = 1.62 | 18,435 / 11,934 = 1.54 | 5,452 / 3,957 = 1.38 | 101,026 / 78,832 = 1.28 |

## Substitutions: cycles per sample

### B-01: WGSL semantics 15,114, all substitutions 6,853 (2.21x)

| switch | ladder: cycles saved when added | cpu without it | cost of leaving it out |
|---|---:|---:|---:|
| lazy select | 1,261 | 8,390 | +1,537 |
| no zero-init | 510 | 7,390 | +538 |
| conversion floor | 58 | 6,845 | -8 |
| polynomial sin/cos | 1,147 | 7,562 | +709 |
| polynomial exp | 1,789 | 6,950 | +98 |
| integer hash | -80 | 6,915 | +62 |
| sky table (+ pow32 in post) | 3,577 | 10,430 | +3,577 |

### R-01: WGSL semantics 15,530, all substitutions 12,887 (1.21x)

| switch | ladder: cycles saved when added | cpu without it | cost of leaving it out |
|---|---:|---:|---:|
| lazy select | 909 | 14,105 | +1,217 |
| no zero-init | 769 | 13,665 | +778 |
| conversion floor | -8 | 12,949 | +62 |
| polynomial sin/cos | 573 | 13,650 | +762 |
| polynomial exp | 192 | 12,893 | +6 |
| integer hash | -78 | 13,189 | +302 |
| sky table (+ pow32 in post) | 285 | 13,173 | +285 |

### L-03: WGSL semantics 13,667, all substitutions 5,342 (2.56x)

| switch | ladder: cycles saved when added | cpu without it | cost of leaving it out |
|---|---:|---:|---:|
| lazy select | 1,355 | 7,052 | +1,710 |
| no zero-init | 366 | 5,858 | +517 |
| conversion floor | 24 | 5,409 | +67 |
| polynomial sin/cos | 1,181 | 5,937 | +595 |
| polynomial exp | 1,791 | 5,396 | +54 |
| integer hash | -113 | 5,407 | +65 |
| sky table (+ pow32 in post) | 3,722 | 9,064 | +3,722 |

### G-01: WGSL semantics 19,915, all substitutions 11,976 (1.66x)

| switch | ladder: cycles saved when added | cpu without it | cost of leaving it out |
|---|---:|---:|---:|
| lazy select | 1,338 | 13,728 | +1,752 |
| no zero-init | 651 | 12,685 | +709 |
| conversion floor | 55 | 11,946 | -30 |
| polynomial sin/cos | 1,028 | 12,701 | +725 |
| polynomial exp | 1,554 | 12,109 | +133 |
| integer hash | -57 | 12,035 | +59 |
| sky table (+ pow32 in post) | 3,370 | 15,345 | +3,370 |

### E-02: WGSL semantics 5,730, all substitutions 4,916 (1.17x)

| switch | ladder: cycles saved when added | cpu without it | cost of leaving it out |
|---|---:|---:|---:|
| lazy select | 7 | 5,119 | +203 |
| no zero-init | 371 | 5,314 | +398 |
| conversion floor | 34 | 4,943 | +28 |
| polynomial sin/cos | 358 | 5,192 | +276 |
| polynomial exp | -5 | 4,918 | +2 |
| integer hash | 3 | 4,964 | +48 |
| sky table (+ pow32 in post) | 47 | 4,962 | +47 |

### W-02: WGSL semantics 102,960, all substitutions 19,387 (5.31x)

| switch | ladder: cycles saved when added | cpu without it | cost of leaving it out |
|---|---:|---:|---:|
| lazy select | 1,406 | 21,261 | +1,874 |
| no zero-init | 1,146 | 20,433 | +1,046 |
| conversion floor | 574 | 19,456 | +69 |
| polynomial sin/cos | 76,958 | 20,684 | +1,296 |
| polynomial exp | 398 | 19,303 | -85 |
| integer hash | 2,784 | 22,618 | +3,231 |
| sky table (+ pow32 in post) | 306 | 19,693 | +306 |

## Microbenchmarks (cycles per instruction)

- rdcycle-pair: 3.00 (3 cycles / 0)
- add: 1.02 (260 cycles / 256)
- mul: 2.02 (517 cycles / 256)
- div+addi: 6.01 (3079 cycles / 512)
- lw-chain: 2.01 (515 cycles / 256)
- fadd.s: 4.02 (1030 cycles / 256)
- fmul.s: 4.02 (1030 cycles / 256)
- fmadd.s: 5.03 (1288 cycles / 256)
- fmin.s: 4.02 (1030 cycles / 256)
- fdiv.s: 19.02 (4870 cycles / 256)
- fdiv.s-dividend: 19.02 (4870 cycles / 256)
- fdiv.s-1/1: 6.02 (1542 cycles / 256)
- fdiv.s-indep: 19.02 (4870 cycles / 256)
- fdiv.s-2chains: 17.04 (4363 cycles / 256)
- fsqrt.s+fadd.s: 11.51 (5894 cycles / 512)
- fsqrt.s-indep: 19.02 (4868 cycles / 256)
- fdiv.s+8addi: 2.11 (4871 cycles / 2304)
- fcvt.w.s+fcvt.s.w: 3.01 (1541 cycles / 512)
- flw-indep: 4.01 (1026 cycles / 256)
- beqz-taken: 3.02 (773 cycles / 256)

## Post pass (cycles per pixel)

- cpu: display 4,350, one a-trous iteration 11,843
- cpu-O3: display 4,346, one a-trous iteration 11,696
- cpu-exp: display 4,336, one a-trous iteration 18,172
- cpu-floor: display 4,340, one a-trous iteration 11,855
- cpu-hash: display 4,341, one a-trous iteration 11,842
- cpu-iram: display 4,332, one a-trous iteration 11,840
- cpu-lazy: display 4,341, one a-trous iteration 11,874
- cpu-noinit: display 4,340, one a-trous iteration 11,842
- cpu-trig: display 4,359, one a-trous iteration 11,843
- exp: display 4,347, one a-trous iteration 17,428
- floor: display 4,360, one a-trous iteration 23,302
- hash: display 4,346, one a-trous iteration 17,461
- lazy: display 4,358, one a-trous iteration 23,283
- noinit: display 4,360, one a-trous iteration 23,284
- trig: display 4,321, one a-trous iteration 23,290
- wgsl: display 4,358, one a-trous iteration 23,287

## Placement

- internal|B-01: 6,844 cycles per sample, L1D misses per sample 4.7
- internal|R-01: 12,877 cycles per sample, L1D misses per sample 0.1
- psram|B-01: 6,832 cycles per sample, L1D misses per sample 5.1
- psram|R-01: 12,883 cycles per sample, L1D misses per sample 0.1

minstret: {'retired': 1002, 'cycles': 43178}
