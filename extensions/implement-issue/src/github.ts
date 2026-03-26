import type { GitHubIssue } from "./types";

export function normalizeGitHubIssue(input: {
  number: number;
  title: string;
  body: string | null;
}): GitHubIssue {
  const body = input.body?.trim() ? input.body.trim() : null;

  return {
    number: input.number,
    title: input.title,
    body,
  };
}
