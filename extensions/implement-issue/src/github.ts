import type { GitHubIssue } from "./types";

export function normalizeGitHubIssue(input: {
  number: number;
  title: string;
  body: string | null;
}): GitHubIssue {
  return {
    number: input.number,
    title: input.title,
    body: input.body,
  };
}
