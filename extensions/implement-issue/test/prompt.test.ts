import { describe, expect, it } from "vitest";

import { buildImplementIssuePrompt } from "../src/prompt";

describe("buildImplementIssuePrompt", () => {
  it("includes issue and repo context", () => {
    const prompt = buildImplementIssuePrompt({
      issue: {
        number: 123,
        title: "Fix search ranking",
        body: "Search results are ordered incorrectly.",
      },
      repo: {
        name: "pi-extensions",
        rootPath: "/Users/bnwaneampeh/projects/pi-extensions",
      },
      worktree: {
        path: "/Users/bnwaneampeh/projects/pi-extensions-issue-123-fix-search-ranking",
        branch: "pi-extensions/issue-123-fix-search-ranking",
      },
      options: {
        issueNumber: 123,
        yes: false,
        resume: true,
        noWorktree: false,
        noInstall: false,
        planOnly: false,
      },
    });

    expect(prompt).toContain("Load and follow the implementer skill");
    expect(prompt).toContain("/skill:implementer");
    expect(prompt).toContain("Issue #123: Fix search ranking");
    expect(prompt).toContain("Repo: pi-extensions");
    expect(prompt).toContain("Worktree path: /Users/bnwaneampeh/projects/pi-extensions-issue-123-fix-search-ranking");
    expect(prompt).toContain("Branch: pi-extensions/issue-123-fix-search-ranking");
    expect(prompt).toContain("Search results are ordered incorrectly.");
  });

  it("changes guidance for plan-only mode", () => {
    const prompt = buildImplementIssuePrompt({
      issue: {
        number: 456,
        title: "Add monorepo linking docs",
        body: null,
      },
      repo: {
        name: "pi-extensions",
        rootPath: "/repo",
      },
      worktree: {
        path: "/repo-issue-456-add-monorepo-linking-docs",
        branch: "pi-extensions/issue-456-add-monorepo-linking-docs",
      },
      options: {
        issueNumber: 456,
        yes: true,
        resume: false,
        noWorktree: false,
        noInstall: false,
        planOnly: true,
      },
    });

    expect(prompt).toContain("Stop after producing the implementation plan and wait for user approval.");
    expect(prompt).not.toContain("Begin the TDD implementation workflow after the plan is approved.");
  });

  it("renders a fallback when issue body is null", () => {
    const prompt = buildImplementIssuePrompt({
      issue: { number: 789, title: "Empty body issue", body: null },
      repo: { name: "my-repo", rootPath: "/repo" },
      worktree: { path: "/repo-issue-789-empty-body-issue", branch: "my-repo/issue-789-empty-body-issue" },
      options: { issueNumber: 789, yes: false, resume: false, noWorktree: false, noInstall: false, planOnly: false },
    });

    expect(prompt).toContain("No issue body provided.");
  });
});
