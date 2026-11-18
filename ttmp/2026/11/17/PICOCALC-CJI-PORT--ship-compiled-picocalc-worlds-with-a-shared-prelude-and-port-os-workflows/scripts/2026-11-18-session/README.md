---
Title: Files, Agenda and serial progress investigation
Ticket: PICOCALC-CJI-PORT
Status: active
Topics: [esp32-p4, native]
DocType: reference
Intent: long-term
---

# Files, Agenda and serial progress investigation

These are the exact local helper files used or staged during the November 18 measurements. The numbered catalog checker in the parent directory is the portable entry point. The trial and receipt scripts here refer to this workstation's scratch files. The probe variants target a historical PID and were used for one paused-reader diagnostic. The sequence and results appear in diary Steps 21–26 and the following verification entry.

1. nov18-files-agenda.sh gated Agenda on a host-matching Files result. nov18-record-receipt.py recorded Files.
2. nov18-retry-agenda.sh retried the disconnected observer. nov18-agenda-probe.py, nov18-agenda-probe2.py and nov18-agenda-pyserial-status.py were successive read-only console probes while the host reader was paused.
3. cji-flash-monitor.py monitored USB identity during application-only writes. nov18-progress-trial.sh and nov18-final-trial.sh exercised status and then ran Agenda and Sandbox on successive builds. nov18-held-trial.sh isolated I²C on the final build.
4. nov18-persist-final.py was the planned full-digest validator for the bus-active trial. See the final verification entry for the measured configuration and script used to publish its result.
