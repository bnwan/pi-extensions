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
