---
Title: Scalar researcher final discussion before technical editing
Ticket: PICOCALC-TYPED-RAY
DocType: reference
Status: complete
Topics: [compiler, performance]
---

Written by Opus High (claude-opus-5-5) using the aggregate observations in scripts/commission/scalar-final.txt. The project articles incorporate the discussion after technical review.

Two kinds of result are measured here. On correctness, the clean scalar generated code matched the C reference's full 160 by 160 image, depth values and winning objects on all twelve fixtures. On cost, it took 57.674 ms per frame on the default pose, compared with 9.521 ms for scalar C.

Restricting sphere tests to each sphere's exact projected row spans is a safe range reduction. In an orthographic view all rays are parallel, so a pixel outside a sphere's projected disc cannot hit that sphere, and skipping that test changes no answer. Tested candidates fell from 76,800 to 6,983, about 91 percent, yet frame time fell only to 50.410 ms, about 13 percent. Reordering shadow traversal as well brought the frame to 33.268 ms, which is still roughly 3.5 times the C time.

Candidate counts cannot predict latency because they count only primary intersection tests. The frame also pays for loop control, shading, shadow rays and pixel writes, and the count omits all of these. One interpretation, which is a hypothesis rather than a measurement, is that after span restriction the shadow pass dominated the remaining time. That would explain why reordering it saved more time than the far larger candidate reduction did.

The restricted variants still need the same full comparison against the reference. Silhouette fixtures should place sphere edges exactly on pixel centers and span endpoints, where integer rounding could drop a true hit or admit a false one. Equal-depth fixtures should place two objects at identical depth over shared pixels and require the reference's tie-break winner at every such pixel.

A falsifiable follow-up is to time the shadow pass alone, before and after reordering, on the default pose. If that pass accounts for most of the 17.142 ms gain, the hypothesis survives. If it does not, the hypothesis is wrong.
