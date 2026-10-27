// A world that crashes when asked, for the Faults app.
service("flaky").on("boom", function () { throw new Error("boom, thrown on purpose"); });
