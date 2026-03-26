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

export function buildIssueBranchName(repoName: string, issueNumber: number, slug: string): string {
  return `${repoName}/issue-${issueNumber}-${slug}`;
}

export function buildIssueWorktreePath(repoName: string, issueNumber: number, slug: string): string {
  return `../${repoName}-issue-${issueNumber}-${slug}`;
}

export function findIssueWorktree(worktrees: GitWorktree[], issueNumber: number): GitWorktree | null {
  const branchMarker = `/issue-${issueNumber}-`;
  const pathMarker = `-issue-${issueNumber}-`;

  return (
    worktrees.find((worktree) => worktree.branch?.includes(branchMarker) ?? false) ??
    worktrees.find((worktree) => worktree.path.includes(pathMarker)) ??
    null
  );
}
