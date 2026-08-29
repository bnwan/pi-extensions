import { basename, resolve } from "node:path";

export type GitWorktree = {
  path: string;
  head: string;
  branch: string | null;
  bare: boolean;
  detached: boolean;
};

export function parseGitWorktreeList(output: string): GitWorktree[] {
  const normalized = output.trim();
  if (!normalized) {
    return [];
  }

  const blocks = normalized
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.map((block) => {
    const entry: GitWorktree = {
      path: "",
      head: "",
      branch: null,
      bare: false,
      detached: false,
    };

    for (const line of block.split("\n")) {
      if (line.startsWith("worktree ")) {
        entry.path = line.slice("worktree ".length);
        continue;
      }
      if (line.startsWith("HEAD ")) {
        entry.head = line.slice("HEAD ".length);
        continue;
      }
      if (line.startsWith("branch refs/heads/")) {
        entry.branch = line.slice("branch refs/heads/".length);
        continue;
      }
      if (line === "bare") {
        entry.bare = true;
        continue;
      }
      if (line === "detached") {
        entry.detached = true;
      }
    }

    return entry;
  });
}

/**
 * Parse `owner/repo` from a git remote URL (ssh or https, with or without .git).
 * Returns null when the URL does not look like a GitHub remote.
 */
export function parseOwnerRepo(remoteUrl: string): string | null {
  const trimmed = remoteUrl.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return null;
  }
  const match = trimmed.match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?$/);
  if (!match) {
    return null;
  }
  const [, owner, repo] = match;
  if (!owner || !repo || owner === "git@github.com") {
    return null;
  }
  return `${owner}/${repo}`;
}

/**
 * Extract an issue number from a branch name like `markky/issue-866`,
 * `issue-866`, or `issue-866-slug`. `issue-<n>` must start a branch segment
 * so names like `feature/anti-issue-42` are NOT matched.
 */
export function issueFromBranch(branch: string): number | null {
  const match = branch.match(/(?:^|\/)issue-(\d+)/);
  return match ? Number(match[1]) : null;
}

/**
 * Extract an issue number from a worktree path like `../markky-issue-866`.
 * Paths use the `<repo>-issue-<n>` shape, so a leading `-` is accepted here.
 */
export function issueFromWorktreePath(path: string): number | null {
  const match = path.match(/(?:^|\/|-)issue-(\d+)/);
  return match ? Number(match[1]) : null;
}

/** Issue branch name per the epic-next skill: `<repo>/issue-<n>`. */
export function buildIssueBranch(repoName: string, issue: number): string {
  return `${repoName}/issue-${issue}`;
}

/**
 * Issue worktree path per the epic-next skill: sibling `<repo>-issue-<n>` of
 * the repo root — RESOLVED (no `..` segment) so it compares equal to the
 * paths herdr and `git worktree list` report.
 */
export function buildIssueWorktreePath(repoRoot: string, repoName: string, issue: number): string {
  return resolve(repoRoot, "..", `${repoName}-issue-${issue}`);
}

/** Repository name from its root path. */
export function repoNameFromRoot(repoRoot: string): string {
  return basename(repoRoot);
}