import { describe, expect, it } from "vitest";

import { findIssueWorktree, parseGitWorktreeList } from "../src/git";

describe("parseGitWorktreeList", () => {
  it("parses git worktree porcelain output", () => {
    const output = [
      "worktree /repo",
      "HEAD abcdef1234567890",
      "branch refs/heads/main",
      "",
      "worktree /repo-issue-123-fix-search",
      "HEAD 1234567890abcdef",
      "branch refs/heads/repo/issue-123-fix-search",
    ].join("\n");

    expect(parseGitWorktreeList(output)).toEqual([
      {
        path: "/repo",
        head: "abcdef1234567890",
        branch: "main",
        bare: false,
        detached: false,
      },
      {
        path: "/repo-issue-123-fix-search",
        head: "1234567890abcdef",
        branch: "repo/issue-123-fix-search",
        bare: false,
        detached: false,
      },
    ]);
  });

  it("parses bare worktrees", () => {
    const output = [
      "worktree /repo-bare",
      "HEAD deadbeef12345678",
      "bare",
    ].join("\n");

    expect(parseGitWorktreeList(output)).toEqual([
      {
        path: "/repo-bare",
        head: "deadbeef12345678",
        branch: null,
        bare: true,
        detached: false,
      },
    ]);
  });
});

describe("findIssueWorktree", () => {
  it("finds a matching issue worktree by branch name", () => {
    const worktrees = parseGitWorktreeList([
      "worktree /repo",
      "HEAD abcdef1234567890",
      "branch refs/heads/main",
      "",
      "worktree /repo-issue-123-fix-search",
      "HEAD 1234567890abcdef",
      "branch refs/heads/repo/issue-123-fix-search",
    ].join("\n"));

    expect(findIssueWorktree(worktrees, 123)).toEqual({
      path: "/repo-issue-123-fix-search",
      head: "1234567890abcdef",
      branch: "repo/issue-123-fix-search",
      bare: false,
      detached: false,
    });
  });

  it("falls back to matching the worktree path when branch metadata is missing", () => {
    const worktrees = [
      {
        path: "/repo",
        head: "abcdef1234567890",
        branch: "main",
        bare: false,
        detached: false,
      },
      {
        path: "/repo-issue-123-fix-search",
        head: "1234567890abcdef",
        branch: null,
        bare: false,
        detached: true,
      },
    ];

    expect(findIssueWorktree(worktrees, 123)).toEqual({
      path: "/repo-issue-123-fix-search",
      head: "1234567890abcdef",
      branch: null,
      bare: false,
      detached: true,
    });
  });
});
