---
Title: Review disposition
Ticket: PICOCALC-COMPOSITOR-FAULT
DocType: reference
Topics: [picocalc]
Status: active
---

# Supervisor review of the independent recommendations

The receiver review identified a useful qualification criterion: require a valid screen and advancing application turns in addition to a zero restart delta. This is in the device exercise. Its proposal to clamp all nonzero event results is incorrect and was rejected. The actual SDK gives 1 the meaning “reply later”; converting 2 to 1 would swallow a crash and leave the event awaiting a reply. The deployed loader explicitly rejects 2. The available memory reading is the currently charged usage; the refused request itself does not appear in that reading. No individual allocation site or request size was captured. Retain these corrections when citing the initial review.

The producer review's half-pixel recommendation led to a failing test and the ef0ff95 correction. Its illustrative centering offsets were off by one. The implemented offsets are four for eight entries and seven for fourteen. The physical failure records do not establish a fragmented heap or prove that both elapsed-time events failed to allocate.
