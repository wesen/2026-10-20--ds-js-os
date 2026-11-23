// Repository files now and at a commit: digests, sizes and a directory listing, without leaving the session.
(() => {
  // The backend moved from picocalc-os/compiler/rv32 to compiler/typed/rv32 (PICOCALC-REPO-LAYOUT); 2a5be8f has the old
  // path. PICOCALC-TYPED-PIPELINE turned 60-policies.js into policy.js (policies as pass lists).
  const path = "compiler/typed/rv32/policy.js", old = "picocalc-os/compiler/rv32/60-policies.js";
  const now = repo.read(path), then = repo.show("2a5be8f", old);
  return {path, worktree: {sha256: now.sha256, bytes: now.bytes}, at2a5be8f: {path: old, revision: then.revision, sha256: then.sha256, bytes: then.bytes},
          same: now.sha256 === then.sha256, sources: repo.list("compiler/typed/rv32").map(e => e.name)};
})()
