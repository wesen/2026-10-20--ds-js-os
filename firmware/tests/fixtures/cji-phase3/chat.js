// Drive the shipped compiled Agent. Its test-world name gives it a separate persistent record.
service("chat").state({step: "begin", first: 0})
  .onStart(s => send("agent-probe", "agent.new", {}))
  .on("agent.state", (s, p, msg) => {
    if (msg.from !== "agent-probe") return;
    if (p.phase === "error") { log("PHASE3 AGENT FAIL", p.error); return; }
    if (s.step === "begin" && p.phase === "idle") {
      s.step = "first"; send("agent-probe", "agent.submit", {text:"phase3-first"});
    } else if (s.step === "first" && p.phase === "requesting") {
      s.first = p.run; s.step = "cancel"; send("agent-probe", "agent.cancel", {});
    } else if (s.step === "cancel" && p.phase === "cancelled") {
      log("PHASE3 AGENT cancelled", p.run); s.step = "second";
      send("agent-probe", "agent.submit", {text:"phase3-second"});
    } else if (s.step === "second" && p.phase === "done") {
      s.step = "done";
      const answers = p.entries.filter(e => e.role === "assistant");
      send("fs-probe", "check-response-size", {});
      log("PHASE3 AGENT replacement", p.run > s.first && answers.length === 1 && answers[0].text === "phase3 replacement accepted");
    }
  });
