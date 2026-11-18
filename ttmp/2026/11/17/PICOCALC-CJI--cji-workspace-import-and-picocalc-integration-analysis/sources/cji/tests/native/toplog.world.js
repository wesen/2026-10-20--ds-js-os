// Chapter 27: a file whose top level makes a system call. main cannot run when the world is
// built (there is no kernel there), so the world gets no snapshot and runs main when it starts.
log("hello from the top level");
service("toplog").on("ping", (s) => "pong");
