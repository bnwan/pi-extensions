import type { ImplementIssuePromptInput } from "./types";

export function buildImplementIssuePrompt(input: ImplementIssuePromptInput): string {
  const { issue, repo, worktree, options } = input;
  const issueBody = issue.body || "No issue body provided.";
  const executionInstruction = options.planOnly
    ? "Stop after producing the implementation plan and wait for user approval."
    : "Begin the TDD implementation workflow after the plan is approved.";

  return [
    "Load and follow the implementer skill.",
    "Use /skill:implementer before doing any implementation work.",
    "",
    `Issue #${issue.number}: ${issue.title}`,
    `Repo: ${repo.name}`,
    `Repo root: ${repo.rootPath}`,
    `Worktree path: ${worktree.path}`,
    `Branch: ${worktree.branch}`,
    "",
    "Treat the worktree path above as authoritative even if the current cwd differs.",
    "Create or refine the implementation plan first and follow the implementer workflow exactly.",
    executionInstruction,
    "",
    "Issue body:",
    issueBody,
  ].join("\n");
}
