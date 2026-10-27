// Runs past its budget on every start: restarted with backoff, then stopped.
service("hog").onStart(function () { var n = 0; for (;;) n++; });
