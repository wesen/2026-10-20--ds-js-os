// Repository files now and at a commit: digests, sizes and a directory listing, without leaving the session.
(() => {
  const path = "picocalc-os/compiler/rv32/60-policies.js";
  const now = repo.read(path), then = repo.show("2a5be8f", path);
  return {path, worktree: {sha256: now.sha256, bytes: now.bytes}, at2a5be8f: {revision: then.revision, sha256: then.sha256, bytes: then.bytes},
          same: now.sha256 === then.sha256, sources: repo.list("picocalc-os/compiler/rv32").map(e => e.name)};
})()
