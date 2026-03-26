export type ImplementIssueFlags = {
  yes: boolean;
  resume: boolean;
  noWorktree: boolean;
  noInstall: boolean;
  planOnly: boolean;
};

export type ImplementIssueOptions = ImplementIssueFlags & {
  issueNumber: number;
};

export type GitHubIssue = {
  number: number;
  title: string;
  body: string | null;
};

export type RepoContext = {
  name: string;
  rootPath: string;
};

export type WorktreeContext = {
  path: string;
  branch: string;
};

export type ImplementIssuePromptInput = {
  issue: GitHubIssue;
  repo: RepoContext;
  worktree: WorktreeContext;
  options: ImplementIssueOptions;
};
