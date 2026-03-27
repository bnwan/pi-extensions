import type { ImplementIssueOptions } from "./types";

const FLAG_MAP = {
  "--yes": "yes",
  "--resume": "resume",
  "--no-worktree": "noWorktree",
  "--no-install": "noInstall",
  "--plan-only": "planOnly",
} as const;

const ISSUE_NUMBER_PATTERN = /^\d+$/;

export function parseImplementIssueArgs(input: string): ImplementIssueOptions {
  const tokens = input.trim().split(/\s+/).filter(Boolean);

  const options: ImplementIssueOptions = {
    issueNumber: 0,
    yes: false,
    resume: false,
    noWorktree: false,
    noInstall: false,
    planOnly: false,
  };

  for (const token of tokens) {
    if (token in FLAG_MAP) {
      const key = FLAG_MAP[token as keyof typeof FLAG_MAP];
      options[key] = true;
      continue;
    }

    if (token.startsWith("-")) {
      throw new Error(`Unknown flag: ${token}`);
    }

    if (!ISSUE_NUMBER_PATTERN.test(token) || Number(token) <= 0) {
      throw new Error("Issue number must be a positive integer");
    }

    if (options.issueNumber !== 0) {
      throw new Error("Issue number must be provided only once");
    }

    options.issueNumber = Number(token);
  }

  if (options.issueNumber === 0) {
    throw new Error("Issue number is required");
  }

  return options;
}
