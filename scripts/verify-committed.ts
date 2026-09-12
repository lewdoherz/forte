import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, linkSync, mkdirSync, mkdtempSync, readdirSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Verifies the committed tree at HEAD, not the working tree.
 *
 * `bun run typecheck && bun run lint && bun run verify:service-worker &&
 * bun run build && bun run db:verify` proves the working tree compiles and its
 * service-worker policy behaves. It does not prove the commit does: tracked
 * source can import a file that is itself still untracked, and every check above
 * resolves it off disk. A runner only receives the commit, so the
 * same import fails there — after the local checks reported success. This
 * script closes that gap by checking HEAD out into a throwaway git worktree,
 * where only committed files exist, and running the checks in it.
 *
 * Dependencies are mirrored from the repository's existing node_modules rather
 * than installed: the same versions are already on disk, and an install would
 * make the check network-bound for no gain. Each file is hard-linked, which
 * copies no data; unlike a junction for the whole directory it also keeps
 * node_modules resolvable *inside* the worktree, because Turbopack refuses a
 * node_modules symlink that escapes the project root and the build would fail
 * for a reason unrelated to the commit. Cross-volume worktrees fall back to a
 * real copy per file.
 *
 * The worktree is removed on every exit path, including a failed check or a
 * signal, so `git worktree list` returns to its original state.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const realNodeModules = join(root, "node_modules");

/** The checks CI runs, in the same order. Fail fast and name the first failure. */
const checks = ["typecheck", "lint", "verify:service-worker", "build", "db:verify"];

function git(args: string[]): { ok: boolean; out: string } {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.error) {
    return { ok: false, out: result.error.message };
  }
  return { ok: result.status === 0, out: (result.stdout ?? "") + (result.stderr ?? "") };
}

const head = git(["rev-parse", "--short", "HEAD"]);
if (!head.ok) {
  console.error(`Cannot resolve HEAD: not a git repository, or no commit yet.\n${head.out.trim()}`);
  process.exit(1);
}
const headName = head.out.trim();

const before = git(["worktree", "list", "--porcelain"]).out;
const scratch = mkdtempSync(join(tmpdir(), "forte-verify-committed-"));
const tree = join(scratch, "tree");
const link = join(tree, "node_modules");

let created = false;
let linked = false;

function cleanup(): void {
  // node_modules in the worktree is a tree of hard links, so deleting it
  // unlinks those copies and leaves the real files untouched.
  if (linked) {
    rmSync(link, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    linked = false;
  }
  if (created) {
    git(["worktree", "remove", "--force", tree]);
    created = false;
  }
  rmSync(scratch, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  // If the worktree was registered but its directory is already gone, prune
  // clears the administrative entry so `git worktree list` is unchanged.
  git(["worktree", "prune"]);
}

// A cleanup that only ran in a try/finally would leave the worktree behind on
// Ctrl-C, which is worse than no check at all.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    cleanup();
    process.exit(1);
  });
}

function run(script: string): Promise<number> {
  const { promise, resolve } = Promise.withResolvers<number>();
  const child = spawn(process.execPath, ["run", script], { cwd: tree, stdio: "inherit" });
  child.on("exit", (code) => resolve(code ?? 1));
  return promise;
}

/**
 * Reproduces the repository's node_modules inside the worktree. A junction for
 * the whole directory would be cheaper, but Turbopack refuses a node_modules
 * symlink that escapes the project root — the build fails with "points out of
 * the filesystem root" — so every file is hard-linked instead, which copies no
 * data. A worktree on another volume cannot hard-link, so those files are
 * copied.
 */
function mirrorTree(source: string, destination: string): void {
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    if (entry.isDirectory()) {
      mirrorTree(from, to);
    } else if (entry.isSymbolicLink()) {
      // node_modules has none today; preserve any a package manager adds.
      symlinkSync(readlinkSync(from), to);
    } else {
      try {
        linkSync(from, to);
      } catch {
        copyFileSync(from, to);
      }
    }
  }
}

if (!existsSync(realNodeModules)) {
  console.error("node_modules is missing from the repository; run `bun install` first.");
  cleanup();
  process.exit(1);
}

const add = git(["worktree", "add", "--detach", "--quiet", tree, "HEAD"]);
if (!add.ok) {
  console.error(`Failed to create a worktree at HEAD:\n${add.out.trim()}`);
  cleanup();
  process.exit(1);
}
created = true;

let failed: string | null = null;

try {
  try {
    mirrorTree(realNodeModules, link);
    linked = true;
  } catch (error) {
    console.error(`Failed to mirror node_modules into the worktree: ${String(error)}`);
    cleanup();
    process.exit(1);
  }

  // Prove the mirror resolves before trusting the checks: a broken mirror would
  // fail every check for the wrong reason and look like a bad commit.
  const worktreeRequire = createRequire(join(tree, "package.json"));
  try {
    console.log(`node_modules mirrored (typescript → ${worktreeRequire.resolve("typescript")})`);
  } catch (error) {
    console.error(`node_modules did not resolve inside the worktree: ${String(error)}`);
    cleanup();
    process.exit(1);
  }

  console.log(`Verifying the committed tree at HEAD (${headName}) in a temporary worktree.`);

  for (const check of checks) {
    console.log(`\n$ bun run ${check}   (committed tree)`);
    if ((await run(check)) !== 0) {
      failed = check;
      break;
    }
  }
} finally {
  // Catches an unexpected throw as well as the normal paths, so the worktree
  // never outlives the check.
  cleanup();
}

const after = git(["worktree", "list", "--porcelain"]).out;
if (after !== before) {
  console.error(`\nCleanup left the worktree list changed:\n${after.trim()}`);
  process.exit(1);
}

if (failed) {
  console.error(`\nHEAD (${headName}) failed \`bun run ${failed}\` — the commit does not verify.`);
  process.exit(1);
}

console.log(
  `\nHEAD (${headName}) verifies: typecheck, lint, service worker, build and db:verify pass on the committed tree.`,
);
