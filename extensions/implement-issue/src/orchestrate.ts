import { basename, resolve } from "node:path";
import { readdirSync } from "node:fs";
import { parseImplementIssueArgs } from "./args";
import { normalizeGitHubIssue } from "./github";
import {
  parseGitWorktreeList,
  findIssueWorktree,
  buildIssueBranchName,
  buildIssueWorktreePath,
} from "./git";
import { slugIssueTitle } from "./slug";
import { detectInstallCommand } from "./install";
import { buildImplementIssuePrompt } from "./prompt";
import { shell, shellOrThrow } from "./shell";
import type { RepoContext, WorktreeContext } from "./types";

export class UserAbortedError extends Error {
  constructor() {
    super("Aborted by user.");
    this.name = "UserAbortedError";
  }
}

export type OrchestrateUI = {
  notify: (msg: string, level: "info" | "warning" | "error") => void;
  confirm: (title: string, message: string) => Promise<boolean>;
};

export type OrchestrationResult = {
  prompt: string;
};

export async function orchestrate(
  rawArgs: string,
  ui: OrchestrateUI
): Promise<OrchestrationResult> {
  // 1. Parse args
  const options = parseImplementIssueArgs(rawArgs);

  // 2. Discover repo
  const repoRoot = shellOrThrow(["git", "rev-parse", "--show-toplevel"]);
  const repoName = basename(repoRoot);
  const repo: RepoContext = { name: repoName, rootPath: repoRoot };

  // 3. Fetch GitHub issue
  ui.notify(`Fetching issue #${options.issueNumber}...`, "info");
  const issueJson = shellOrThrow([
    "gh",
    "issue",
    "view",
    String(options.issueNumber),
    "--json",
    "number,title,body",
  ]);

  let parsed: unknown;
  try {
    parsed = JSON.parse(issueJson);
  } catch {
    throw new Error(`Failed to parse issue JSON from gh: ${issueJson.slice(0, 200)}`);
  }
  const issue = normalizeGitHubIssue(parsed as { number: number; title: string; body: string | null });

  // 4. Build names
  const slug = slugIssueTitle(issue.title);
  const branch = buildIssueBranchName(repoName, issue.number, slug);
  const worktreePath = buildIssueWorktreePath(repoName, issue.number, slug);
  const resolvedWorktreePath = resolve(repoRoot, worktreePath);

  // 5. Find or create worktree
  const worktreeListOutput = shellOrThrow(
    ["git", "worktree", "list", "--porcelain"],
    repoRoot
  );
  const worktrees = parseGitWorktreeList(worktreeListOutput);
  const existing = findIssueWorktree(worktrees, issue.number);

  let finalWorktreePath: string;
  let finalBranch: string;

  if (existing) {
    if (!options.resume && !options.yes) {
      const ok = await ui.confirm(
        `Issue #${issue.number} worktree found`,
        `Reuse existing worktree at ${existing.path}?`
      );
      if (!ok) throw new UserAbortedError();
    }
    finalWorktreePath = existing.path;
    finalBranch = existing.branch ?? branch;
    ui.notify(`Reusing worktree at ${finalWorktreePath}`, "info");
  } else if (options.noWorktree) {
    finalWorktreePath = repoRoot;
    finalBranch = branch;
    ui.notify("Skipping worktree creation (--no-worktree)", "info");
  } else {
    if (!options.yes) {
      const ok = await ui.confirm(
        `Create worktree for issue #${issue.number}`,
        `Create worktree at ${resolvedWorktreePath} on branch ${branch}?`
      );
      if (!ok) throw new UserAbortedError();
    }

    const branchExists =
      shell(["git", "show-ref", "--verify", "--quiet", `refs/heads/${branch}`], repoRoot)
        .exitCode === 0;

    if (branchExists) {
      shellOrThrow(["git", "worktree", "add", resolvedWorktreePath, branch], repoRoot);
    } else {
      shellOrThrow(
        ["git", "worktree", "add", "-b", branch, resolvedWorktreePath],
        repoRoot
      );
    }

    finalWorktreePath = resolvedWorktreePath;
    finalBranch = branch;
    ui.notify(`Created worktree at ${finalWorktreePath}`, "info");
  }

  // 6. Detect and run install
  if (!options.noInstall) {
    let files: string[] = [];
    try {
      files = readdirSync(finalWorktreePath);
    } catch {
      ui.notify(`Could not read worktree directory for install detection: ${finalWorktreePath}`, "warning");
    }

    const installCmd = detectInstallCommand(files);
    if (installCmd) {
      ui.notify(`Running ${installCmd.join(" ")}...`, "info");
      const installResult = shell(installCmd, finalWorktreePath);
      if (installResult.exitCode !== 0) {
        ui.notify(`Install failed: ${installResult.stderr}`, "warning");
      }
    }
  }

  // 7. Build prompt
  const worktree: WorktreeContext = {
    path: finalWorktreePath,
    branch: finalBranch,
  };

  const prompt = buildImplementIssuePrompt({ issue, repo, worktree, options });

  return { prompt };
}
