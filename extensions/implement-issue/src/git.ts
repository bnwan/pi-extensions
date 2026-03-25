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

export function findIssueWorktree(worktrees: GitWorktree[], issueNumber: number): GitWorktree | null {
  const marker = `/issue-${issueNumber}-`;

  return worktrees.find((worktree) => worktree.branch?.includes(marker) ?? false) ?? null;
}
