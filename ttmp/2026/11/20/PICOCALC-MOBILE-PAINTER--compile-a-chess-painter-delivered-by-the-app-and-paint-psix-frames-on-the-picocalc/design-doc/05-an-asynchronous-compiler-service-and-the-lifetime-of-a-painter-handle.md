---
Title: An asynchronous compiler service and the lifetime of a painter handle
Ticket: PICOCALC-MOBILE-PAINTER
Status: active
Topics:
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T16:05:54.677985886-05:00
WhatFor: ""
WhenToUse: ""
---

# An asynchronous compiler service and the lifetime of a painter handle

## Which problem the service would solve

The compositor wants to ask for an installable program, return from its current turn, and later learn that the program is ready. Building and invoking have different requirements. Building can allocate a compiler heap and yield to UI work for a second or more. Invoking should take a known entry and two bounded buffers and complete within the ordinary update budget. The installed code can then serve many positions. The first implementation already separates these operations internally. A named service would make the ownership and scheduling boundary available to future clients and make service load visible in system diagnostics.

There are two separate clocks. Queue-to-completion wall time is what the player experiences when installing a new painter. CPU time charged to the compiler is how much processor capacity the installation required. A compiler waiting for the compositor to draw consumes wall time. Increasing an application's turn deadline to cover that wait would obscure both measurements. The first physical run is instructive. A second-core worker compiled in 1.186 s and a launcher draw timed out before it could use the new entry point. That observation motivated a same-core, lower-priority scheduling comparison. A message boundary alone offers no protection against shared-cache, memory-bus or relocation interference.

## Proposed API

The following names describe a proposal. The current implementation uses mobile_painter_compile, mobile_painter_load and mobile_painter_run with a receiver-owned native pointer. It supports a single approved bundled Chess source. The proposed service would present the following lifecycle.

```text
Chess              compositor             compiler service           native loader
source + state --> authorize publisher
                   request(source,ABI) --> copy or take ownership
                   return from turn        queue, compile, link
                                           prepare image -----------> relocate, bind entry
                   receive ready(handle) <-------------------------- publish handle
next PSIX state -> discover latest state
                   run(handle,state,out) ---------------------------> invoke synchronously
                   validate out, commit
app removed -----> release(handle) ---------------------------------> destroy if last owner
```

- **Request** carries the owned source, schema and drawing ABI version, target, and requested entry signature. The kernel identifies the submitting compositor. The receiver binds the request to the original authorized app and its generation. It can immediately acknowledge the request with a job identifier.
- **Completion** names the job and returns a kernel-managed executable capability. The loader maintains an internal table of pool slot, generation, native image and entry point. The public handle carries the authority to invoke one program. Looking up a slot must also validate its generation and the caller's capability rights.
- **Invocation** accepts the handle, the normalized state and a bounded output buffer. Invoke on the compositor's render lane where the output needs to be consumed. The program has no reason to receive the framebuffer's address. The existing command validator and graphics path can remain the final steps.
- **Release or cancellation** drops a job's interest or a handle reference. If the only requestor restarts during compilation, a queued job can be removed. A running worker may finish; the loader can discard its image before publishing stale authority. Already-in-flight calls need to finish before the final release unmaps code. Keep an installed entry live while a replacement is prepared.

An opaque handle can use the kernel's existing transferable handle and reply mechanisms if their lifetime semantics fit. The code pointers themselves stay private to the component that allocates the executable. A service that returns raw addresses would give each client responsibility for tracking the module's lifetime across restarts and updates, exactly when stale native pointers are most difficult to diagnose. The product currently exposes a trusted native environment. A capability restricts who may invoke an admitted program. Sandboxing the instructions of an untrusted native program remains a separate architectural task.

## Scheduling and failure behavior

A first implementation could retain one worker and one pending build. Deduplicate compatible requests using a content identity that includes source bytes, compiler version and the paint ABI. Before starting, reserve a bounded amount of compiler memory. Charge the build to the service. Measure queue delay, service CPU, install wall time, installation latency on the kernel lane and the slowest observed UI turn as separate quantities. Keep an independent wall timeout to detect abandoned jobs, even if the CPU budget is exceeded only after the service has run for a useful interval.

Use the existing low-priority worker for compilation. ESP ELF installation has different stack requirements because relocation may briefly disable caches. Submit an already-linked image to a loader on internal RAM and time that short operation directly. If relocation itself consumes a substantial part of the presentation deadline, investigate preparing a safe dedicated loader task with an internal stack. Its choice of stack and priority still needs physical measurement.

A compile error should contain a short diagnostic and the job identifier. The compositor can continue displaying its last accepted screen. A restart can request the same source and latest state from the publisher; whether a cached module survives depends on the lifetime promised by the service, compiler version and available memory.

## Experimental comparison

Use the same Chess position, source hash and firmware settings in each trial. Compare a cold boot, installation under active launcher drawing, first focus, subsequently changing the cursor, a compositor restart, and a compiler-service restart midway through work. Record the distribution of UI turn lengths and count deadline misses, including unrelated foreground apps. Compare caller-visible install delay with the sum of queue, CPU, preemption and loader times. Exercise two requestors only after the one-request lifecycle works.

The smallest next change to evaluate would expose the existing single-worker implementation through a kernel-owned job and executable handle for Chess, then add a second client only after the lifetime tests pass. An intern can trace the concrete code today through picocalc-os/port/esp32p4/main/painter_service.c, mobile_painter_p4.c, picocalc-os/nucleus/kernel.c at kernel_ask and settle_ask, and the capability checks in picocalc-os/nucleus/native.c. The completed experiment and the shared-service proposal should be evaluated separately; the former measures an actual installed Chess painter while the latter defines a reusable OS contract.
