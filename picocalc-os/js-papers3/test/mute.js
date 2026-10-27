// Takes asks and never answers them.
service("mute").on("hello", function () { return new Task(); });
