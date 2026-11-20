# CJI source selection

Origin: cji-workspace-final-2026-11-17.zip, book/cji main 908c42bae94e1cfaa7b55a03b51c3750604bc3a8. Archive SHA-256 4275d9447fca25e529683228be36a514da657eaeddacf6806c4142efc6ae97c1.

The [top-level CJI tree](../../../../../../cji/) preserves the upstream compiler, C runtime, vendored assembler with its license, RV32 reference harness and native-world fixtures. The supported reproduction for this selection is the no-snapshot native-world gate in the ticket guide. Whole-book tests and self-hosting targets reference additional upstream inputs. chapters/ preserves chapters 24, 30 and 35. Build output is regenerated locally.
