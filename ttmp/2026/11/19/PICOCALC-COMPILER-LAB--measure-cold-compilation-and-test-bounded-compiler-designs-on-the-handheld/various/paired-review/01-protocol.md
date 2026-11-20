---
Title: Independent forecasting protocol
Ticket: PICOCALC-COMPILER-LAB
Status: complete
Topics: [picocalc, performance]
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
---
# Independent model comparison

This is a retrospective masked forecast on an existing ESP32-P4 experiment. The supervisor previously knew the published comparison. The respondents receive only the identical packet in question.txt, with three boot-1 marginal medians and instruction counts. Neither receives the joint arm, second boot, the other response or a project identifier. This tests generalization across one interaction and one reboot. Training the public models, general comparative author ability, publication quality and independent-device generalization are outside its scope.

Before requesting either forecast, fix this score. Per app and metric, truth is `median(100 * (both - base) / base)` inside paired blocks of boot 2. Compute mean absolute error in percentage points across the three apps for each metric; the overall score is the unweighted mean across all six. Smaller is better. A correct-direction count is secondary. Benchmark both against an additive prediction from each first-boot triple, `100 * (A + B - 2 * base) / base`, and a zero-effect forecast. Retain the numerical table and draw no population-level conclusion. The qualitative mechanism is presented separately and cannot change the numerical ranking.

Freeze each original response before opening the withheld joint rows in this exercise. Whole project histories are excluded from model inputs. The score uses only unchanged archived board data, with no new hardware access required.
